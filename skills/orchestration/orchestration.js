export const meta = {
  name: 'orchestration',
  description: 'Implement every sub-issue of a GitHub breakdown: dependency-ordered dev (rr-workshop:build-with-tdd, sonnet-first escalating model ladder) -> independent QA (opus) -> serialized verified git merge into a dedicated integration branch (opus), then a final integrated review (fable, terse verdicts) with ladder-bounded remediation - circuit breaker and structured blockers throughout',
  whenToUse: 'Launched by rr-workshop:orchestration after its interactive pre-flight (Gate 2). Static script - never edited per run (ADR 0002); all per-run data arrives via args: { parent, source, graph, ladder?, integrated?, answers?, finalReviewDone? }.',
  phases: [
    { title: 'Build', detail: 'dev (rr-workshop:build-with-tdd, worktree-isolated, ladder model) + independent QA (opus) per issue' },
    { title: 'Integrate', detail: 'serialized git merge, post-merge verify, close - in dependency order', model: 'opus' },
    { title: 'Final Review', detail: 'isolated review of the integrated whole + ladder-bounded remediation', model: 'fable' },
  ],
}

// ---- args contract ----------------------------------------------------------
// This script is shipped with the plugin and is NEVER edited per run - per-launch authoring
// lets the model vary the orchestration between runs, which is exactly the nondeterminism the
// workflow exists to eliminate (ADR 0002). Everything per-run travels via args:
// {
//   parent: 'https://github.com/o/r/issues/123',    // required: the spec/PRD/umbrella issue - the shared context every
//                                                   //   agent reads FRESH from the tracker (never from a frozen copy)
//   source: 'main',                                 // required: branch DEV forks from and integration merges into
//   graph: { 124: { deps: [],    title: 'Core DTO', branch: 'orch/<slug>-task-124-core-dto' },
//            125: { deps: [124], title: 'Endpoint', branch: 'orch/<slug>-task-125-endpoint' } },
//                                                   // required: issue numbers -> { deps, title, branch }. No
//                                                   //   description field: issue bodies live on GitHub and every agent
//                                                   //   reads issue #N fresh - a copy here would be a second source of
//                                                   //   truth that goes stale mid-run.
//   ladder: ['sonnet','sonnet','opus'],             // optional: escalation ladder for BOTH dev rounds and final-review
//                                                   //   remediation, rungs from haiku|sonnet|opus|fable; its length IS
//                                                   //   each loop's round budget (default ['sonnet','sonnet','opus'])
//   integrated: [124],                              // optional resume: issue numbers merged in a prior run
//   answers: { 125: 'use approach B',               // optional resume: human answers to prior blockers, by issue number;
//              FINAL: 'guidance' },                 //   the literal key FINAL carries guidance for final-review remediation
//   finalReviewDone: true,                          // optional resume: a prior run already delivered the final review
// }
let input = args
if (typeof input === 'string') {
  try { input = JSON.parse(input) } catch { throw new Error('orchestration: args arrived as a non-JSON string') }
}
if (!input || typeof input !== 'object') throw new Error('orchestration requires args: { parent, source, graph, ... }')
const PARENT = input.parent
const SOURCE = input.source
if (typeof PARENT !== 'string' || !PARENT.trim()) throw new Error('orchestration: args.parent (string) is required')
if (typeof SOURCE !== 'string' || !SOURCE.trim()) throw new Error('orchestration: args.source (string) is required')
if (!input.graph || typeof input.graph !== 'object' || Array.isArray(input.graph) || !Object.keys(input.graph).length) {
  throw new Error('orchestration: args.graph (non-empty object of issueNumber -> { deps, title, branch }) is required')
}
// Rebuild the graph with canonical integer keys. JSON delivers string keys, and a malformed key ('#108', ' 107')
// would otherwise pass shape checks and surface later as an opaque mid-run TypeError instead of failing fast here.
const GRAPH = {}
for (const [k, node] of Object.entries(input.graph)) {
  const num = Number(k)
  if (!Number.isInteger(num) || num <= 0) throw new Error(`orchestration: graph key '${k}' is not a positive integer issue number`)
  if (!node || !Array.isArray(node.deps) || typeof node.title !== 'string' || typeof node.branch !== 'string' || !node.branch.trim()) {
    throw new Error(`orchestration: graph node ${k} must be { deps: number[], title: string, branch: string }`)
  }
  const deps = node.deps.map(Number)
  if (deps.some((d) => !Number.isInteger(d) || d <= 0)) throw new Error(`orchestration: graph node ${k} has a non-integer dep`)
  GRAPH[num] = { deps, title: node.title, branch: node.branch }
}
for (const [k, node] of Object.entries(GRAPH)) {
  for (const d of node.deps) {
    if (!GRAPH[d]) throw new Error(`orchestration: graph node ${k} depends on #${d}, which is not in the graph`)
  }
}
// Reject branch collisions NOW: two issues sharing a branch (or a task branch literally equal to SOURCE) would let
// a `checkout -B` silently clobber one issue's work with another's - discovered only after the fact, mid-run.
{
  const branchOwner = {}
  for (const [k, node] of Object.entries(GRAPH)) {
    if (node.branch === SOURCE) throw new Error(`orchestration: graph node ${k} branch '${node.branch}' must not equal args.source`)
    if (branchOwner[node.branch]) throw new Error(`orchestration: graph nodes ${branchOwner[node.branch]} and ${k} both use branch '${node.branch}' - branch names must be unique`)
    branchOwner[node.branch] = k
  }
}
// Reject cycles and self-deps NOW: ready() would simply never yield cycle members, and an unattended run would
// "complete" with silently dropped issues (notRun, no blocker, no reason) instead of reporting a malformed graph.
{
  const state = {} // 1 = on the current DFS path, 2 = proven acyclic
  const visit = (n, path) => {
    if (state[n] === 2) return
    if (state[n] === 1) throw new Error(`orchestration: dependency cycle in args.graph: ${[...path, n].join(' -> ')}`)
    state[n] = 1
    for (const d of GRAPH[n].deps) visit(d, [...path, n])
    state[n] = 2
  }
  for (const n of Object.keys(GRAPH).map(Number)) visit(n, [])
}
const alreadyIntegrated = new Set((input.integrated || []).map(Number)) // issues merged on a prior run
for (const n of alreadyIntegrated) {
  if (!GRAPH[n]) throw new Error(`orchestration: args.integrated contains #${n}, which is not in the graph`)
}
const blockerAnswers = {} // issueNumber -> human clarification text (resume channel - silent drops here waste a full ladder)
if (input.answers !== undefined) {
  if (!input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) {
    throw new Error('orchestration: args.answers must be an object of issueNumber -> clarification string')
  }
  for (const [k, v] of Object.entries(input.answers)) {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`orchestration: args.answers[${k}] must be a non-empty string`)
    if (k === 'FINAL') { blockerAnswers.FINAL = v; continue } // run-level guidance, consumed by final-review remediation
    const num = Number(k)
    if (!GRAPH[num]) throw new Error(`orchestration: args.answers key '${k}' is not an issue in the graph`)
    blockerAnswers[num] = v
  }
}
// Escalation Ladder: round 1 runs the cheapest model; each QA rejection climbs one rung; a rejection at the
// top rung trips the breaker. Rounds = rungs, so overriding args.ladder changes tiers AND retry budget at once.
// A present-but-invalid ladder throws - silently substituting the default would change models AND budget unnoticed,
// and a typo'd tier would otherwise only fail mid-run at agent-spawn time.
const TIERS = ['haiku', 'sonnet', 'opus', 'fable'] // valid rungs, cheapest -> smartest; fable is opt-in only - dev work is output-heavy and fable bills output at a premium
let LADDER = ['sonnet', 'sonnet', 'opus'] // default: sonnet does dev, round 2 re-runs it fed round 1's QA defects, opus is the rescue rung; pass args.ladder to customize (e.g. ['opus'] for a single-shot run)
if (input.ladder !== undefined) {
  if (!Array.isArray(input.ladder) || !input.ladder.length || input.ladder.some((t) => !TIERS.includes(t))) {
    throw new Error(`orchestration: args.ladder must be a non-empty array of tiers from ${TIERS.join('|')}`)
  }
  LADDER = input.ladder
}

const handoff = {}   // issueNumber -> note string (passed to dependent DEV prompts ONLY)
const status = {}    // issueNumber -> 'integrated' | 'blocked'
const blockers = []  // structured escalation records
const integrationOrder = [] // issues in the order they actually merged
const commitRefs = {}       // issueNumber -> merge commit ref
const todos = {}            // issueNumber -> deferred TODOs reported by DEV

const nums = () => Object.keys(GRAPH).map(Number)
const depsMet = (n) => GRAPH[n].deps.every((d) => status[d] === 'integrated' || alreadyIntegrated.has(d))
const downstreamCount = (n) => nums().filter((m) => GRAPH[m].deps.includes(n)).length
const ready = () =>
  nums()
    .filter((n) => !status[n] && !alreadyIntegrated.has(n) && depsMet(n))
    .sort((a, b) => downstreamCount(b) - downstreamCount(a)) // unblock the most downstream work first

const DEV_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    branch: { type: 'string' },
    inProgressSet: { type: 'boolean', description: 'true once state: in-progress was applied' },
    committed: { type: 'boolean', description: 'true once the work is committed to the branch' },
    summary: { type: 'string' }, newApis: { type: 'string' }, todos: { type: 'string' },
  },
  required: ['branch', 'committed', 'summary'],
}
const QA_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { pass: { type: 'boolean' }, defects: { type: 'array', items: { type: 'string' } } },
  required: ['pass'],
  // No if/then conditional here: structured-output schema subsets often reject conditional keywords, and a rejected
  // schema would kill every QA spawn. The prompt demands defects on rejection; buildIssue substitutes an actionable
  // fallback if QA omits them anyway.
}
const INTEGRATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { ok: { type: 'boolean' }, commitRef: { type: 'string' }, conflicts: { type: 'array', items: { type: 'string' } }, failureSummary: { type: 'string', description: 'why post-merge verification failed, when it did' } },
  required: ['ok'],
  // No if/then conditional (see QA_SCHEMA note). The success branch keys on ok alone - an ok merge has already been
  // recorded on the tracker, so a missing commitRef must never route it to the failure branch.
}
const FINAL_REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    pass: { type: 'boolean' },
    // One line per finding - the judge is fable, which bills output at a premium; the format keeps verdicts cheap
    // while still self-sufficient for a cheaper remediation agent to act on without re-investigating.
    findings: { type: 'array', items: { type: 'string', description: 'ONE line: file:line (or module) - defect - expected behavior per the parent spec/criterion it violates - fix pointer if obvious' } },
  },
  required: ['pass'],
}
const REMEDIATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { committed: { type: 'boolean' }, commitRef: { type: 'string' }, summary: { type: 'string' } },
  required: ['committed', 'summary'],
}

function devPrompt(n, priorDefects) {
  const note = GRAPH[n].deps.map((d) => handoff[d]).filter(Boolean).join('\n\n')
  const ans = blockerAnswers[n] ? `\nResolved clarification from the human: ${blockerAnswers[n]}` : ''
  const redo = priorDefects ? `\n\nPrevious QA REJECTED with: ${JSON.stringify(priorDefects)} - fix exactly these.` : ''
  return [
    `Implement issue #${n} ("${GRAPH[n].title}"), a sub-issue of ${PARENT}. You run in your OWN isolated git worktree, so you cannot collide with other DEV agents.`,
    `Invoke rr-workshop:build-with-tdd for issue #${n} - its "issue-driven, unattended" mode. It owns the Full-Context Load, the state:in-progress flip, and the red-green-refactor loop.`,
    `BRANCH BASE IS NON-NEGOTIABLE: create the branch FROM '${SOURCE}' (git checkout -b ${GRAPH[n].branch} ${SOURCE}) - never from main or whatever HEAD you find; '${SOURCE}' already contains every integrated upstream slice you build on. Perform ALL git operations inside your assigned worktree directory - never cd into another clone or worktree of this repo.`,
    `The acceptance criteria + parent spec ARE the approved interface contract - do NOT wait for any user approval; this is an unattended orchestrated run. Do NOT spawn any QA sub-agent - you cannot spawn sub-agents; an independent QA stage runs after you return.`,
    note ? `Upstream handoff (dependencies already integrated):\n${note}` : '',
    ans,
    `When green and the full suite passes, COMMIT your work to branch '${GRAPH[n].branch}' with a conventional-commit message and NO Claude/Anthropic/Co-Authored-By attribution. Do NOT merge into ${SOURCE} - integration is a separate serialized stage.`,
    `Return: the branch name, inProgressSet (did you set state: in-progress?), committed (did you commit?), a 1-3 sentence summary, any new files/APIs downstream issues will touch, and any out-of-scope TODOs.`,
    redo,
  ].filter(Boolean).join('\n')
}

// ISOLATED: only the parent reference, the issue number, and a branch pointer. NEVER the dev transcript, dev
// self-report, or handoff note - QA's value IS its independence. Verdicts are output-light by design: no
// adversarial self-attack ritual here - that discipline runs once, in pre-flight, over the graph/edges/branches;
// re-running it per-issue on every rung is exactly the cost matching rr-workshop:build-with-tdd's cheaper QA
// contract trims.
function qaPrompt(n, branch) {
  return [
    `Independently QA issue #${n}, a sub-issue of ${PARENT}. Form your OWN picture from the source of truth - do not trust any prior report.`,
    `Read FRESH before judging: issue #${n}'s body + ALL its comments + acceptance criteria; the parent's body + ALL its comments; and every sibling sub-issue's acceptance criteria (to catch overlap or contradiction).`,
    `The implementation is committed on branch '${branch}'. Inspect it via a TEMPORARY detached worktree (git worktree add --detach <tmpdir> ${branch}; git worktree remove <tmpdir> when done) - NEVER switch the branch of an existing checkout or cd into another clone of this repo. In that worktree: build from a CLEAN state, run the full test suite, and verify EACH acceptance criterion against the parent's intent.`,
    `Return pass:true ONLY if it builds, all tests pass, and every acceptance criterion is met; otherwise pass:false with a specific list of defects.`,
  ].join('\n')
}

async function buildIssue(n) {
  let priorDefects = null
  let infraRetried = false // one same-rung retry per issue for a null (skipped/failed) agent: infrastructure, not capability
  const rounds = []        // per-round escalation record, carried into any blocker for the post-run grilling
  for (let round = 1; round <= LADDER.length; round++) {
    const tier = LADDER[round - 1]
    // isolation:'worktree' gives each DEV its own working tree, so concurrent work-starter `git checkout -b` is safe.
    // model: the ladder rung for this round - QA rejections climb it (reactive escalation, not predictive).
    const dev = await agent(devPrompt(n, priorDefects), { label: `dev:#${n}:r${round}:${tier}`, phase: 'Build', schema: DEV_SCHEMA, isolation: 'worktree', model: tier })
    if (!dev) {
      if (!infraRetried) { infraRetried = true; round--; continue } // retry the SAME rung - don't burn a rung on infrastructure
      status[n] = 'blocked'; blockers.push({ issue: n, reason: 'dev agent unavailable (infrastructure, after same-rung retry)', rounds }); return null
    }
    if (!dev.committed) {
      // A cheap dev failing to deliver a commit is a capability outcome, not an error - it climbs the ladder like a QA rejection.
      rounds.push({ round, tier, outcome: 'dev did not commit', devSummary: dev.summary || '' })
      priorDefects = [`Round ${round} dev (${tier}) failed to produce a committed implementation${dev.summary ? `: ${dev.summary}` : ''}`]
      continue
    }
    // QA pinned opus at every rung - the climb gate must out-reason the dev tiers, and verdicts are
    // output-light so the smart model is cheap here. The fable final review backstops the integrated whole.
    const qa = await agent(qaPrompt(n, dev.branch), { label: `qa:#${n}:r${round}`, phase: 'Build', schema: QA_SCHEMA, model: 'opus' })
    if (!qa) {
      if (!infraRetried) { infraRetried = true; round--; continue } // a missing verdict must not escalate the ladder or trip the breaker
      status[n] = 'blocked'; blockers.push({ issue: n, reason: 'QA agent unavailable (infrastructure, after same-rung retry)', rounds }); return null
    }
    rounds.push({ round, tier, devSummary: dev.summary, pass: qa.pass, defects: qa.defects || [] })
    if (qa.pass) return { issue: n, branch: dev.branch, dev }
    priorDefects = (qa.defects && qa.defects.length) ? qa.defects : ['QA rejected without listing defects - independently re-verify EVERY acceptance criterion and fix what fails']
  }
  status[n] = 'blocked'
  blockers.push({ issue: n, reason: `circuit breaker tripped (ladder exhausted after ${LADDER.length} rounds)`, rounds, lastDefects: priorDefects })
  return null
}

// Resume reconciliation: a session can die after an issue closes but before the report is read.
// Skip anything already CLOSED on the tracker, not just whatever args carried.
const unreconciled = nums().filter((n) => !alreadyIntegrated.has(n))
if (unreconciled.length) {
  const recon = await agent(
    `For each of these issue numbers [${unreconciled.join(', ')}] (all sub-issues of ${PARENT}), check the tracker and report which are already CLOSED. Return { integrated: [issue numbers] } only.`,
    { label: 'reconcile', phase: 'Build', model: 'haiku', schema: { type: 'object', additionalProperties: false, properties: { integrated: { type: 'array', items: { type: 'number' } } }, required: ['integrated'] } }
  )
  ;((recon && recon.integrated) || []).forEach((n) => { if (GRAPH[Number(n)]) alreadyIntegrated.add(Number(n)) })
}

// Wave scheduler: build all currently-ready issues in parallel (barrier), integrate them serially, repeat.
// (Waves suit wide+shallow graphs; for narrow+deep graphs a pipeline() per dependency chain pipelines better -
// deliberate simplicity, revisit with run data.)
phase('Build')
while (ready().length) {
  const wave = ready()
  const built = await parallel(wave.map((n) => () => buildIssue(n)))
  phase('Integrate')
  for (const b of built.filter(Boolean)) {
    const intg = await agent([
      `Integrate issue #${b.issue} of ${PARENT}. Work in a TEMPORARY worktree for the target branch (git worktree add <tmpdir> ${SOURCE}; git worktree remove <tmpdir> when done) - NEVER switch the branch of an existing checkout and never cd into another clone of this repo. If the add fails because '${SOURCE}' is checked out elsewhere, use a detached worktree (git worktree add --detach <tmpdir> ${SOURCE}), merge on its detached HEAD, and on success update the branch ref from inside it: git push . HEAD:refs/heads/${SOURCE}`,
      `In that worktree: note the current HEAD of '${SOURCE}', then merge branch '${b.branch}' into it using git DIRECTLY - do NOT use the approval-gated /commit skill (a workflow cannot answer its prompt).`,
      `If the merge conflicts, do NOT force or guess: abort the merge and return ok:false with the conflicting file paths.`,
      `After a clean merge, VERIFY it: build and run the full test suite on '${SOURCE}'. A textually clean merge can still be semantically broken by sibling slices that landed after this branch forked. If the suite is red, undo the merge (git reset --hard to the pre-merge HEAD you noted), do NOT close the issue, and return ok:false with failureSummary.`,
      `Only on a VERIFIED merge (suite green): the merge commit message must carry NO Claude/Anthropic/Co-Authored-By attribution. Then close the issue: gh issue close ${b.issue} --reason completed`,
      `Return ok (true ONLY if merged, verified, and closed cleanly), commitRef, conflicts, and failureSummary when verification failed.`,
      // opus: post-merge verification is a judgment call (is the red suite the merge's fault or pre-existing?) that
      // gates a close. Its judgment on conflicts stays capped by design: conflicts abort, they are never resolved.
    ].join('\n'), { label: `integrate:#${b.issue}`, phase: 'Integrate', schema: INTEGRATE_SCHEMA, model: 'opus' })

    if (intg && intg.ok) { // ok:true means merged, verified, AND closed
      status[b.issue] = 'integrated'
      integrationOrder.push(b.issue)
      commitRefs[b.issue] = intg.commitRef || null
      if (b.dev.todos) todos[b.issue] = b.dev.todos
      handoff[b.issue] = `#${b.issue} (${GRAPH[b.issue].title}) integrated: ${b.dev.summary} New: ${b.dev.newApis || 'none'}. commit: ${intg.commitRef || '(unreported)'}. Deferred TODOs: ${b.dev.todos || 'none'}`
      log(`integrated #${b.issue}`)
    } else {
      status[b.issue] = 'blocked'
      blockers.push({ issue: b.issue, reason: 'integration failed (conflict or post-merge verification)', conflicts: (intg && intg.conflicts) || null, failureSummary: (intg && intg.failureSummary) || null })
      log(`BLOCKED #${b.issue} at integration - its dependents will not run`)
    }
  }
  phase('Build')
}

// Final Review: per-slice QA judged branches pre-merge; nobody has yet judged the integrated whole against the
// parent. Gate on ANY integrated work - including prior sessions' (a crash between the last merge and this review
// would otherwise skip the judgment forever, since the resume's wave loop no-ops on reconciled issues).
const integratedNums = nums().filter((n) => status[n] === 'integrated')
const anyIntegrated = integratedNums.length > 0 || alreadyIntegrated.size > 0
let finalReview = { status: 'skipped', findings: [] } // status: 'skipped' | 'pass' | 'fail' | 'unavailable'
const remediation = [] // per-round final-review fix records

// Sub-issues that never integrated are already escalated (blocker or notRun) - the judge must know they are
// out of scope, or every partially-blocked run fails the final review and remediation starts implementing missing
// slices out-of-band on SOURCE, bypassing the per-issue dev/QA/integration pipeline entirely.
const unintegrated = nums().filter((n) => status[n] !== 'integrated' && !alreadyIntegrated.has(n))

// The judge is reusable: the remediation loop needs a FRESH, isolated re-judgment after every fix - the fixer
// never grades its own work. A null result is infrastructure, not a verdict: one same-judgment retry, then
// 'unavailable' (which the caller MUST surface as a blocker - an ungraded state is never a clean run).
const runFinalReview = async (round) => {
  const prompt = [
    `Final review of ${PARENT} as integrated on branch '${SOURCE}'. Form your OWN picture from the source of truth - you know nothing about how the implementation went, and that is deliberate.`,
    `Read FRESH: the parent's body + ALL its comments, and every sub-issue's body + acceptance criteria.`,
    unintegrated.length ? `OUT OF SCOPE: sub-issues ${unintegrated.map((n) => `#${n}`).join(', ')} did NOT integrate in this run and are already escalated to a human. Judge ONLY the integrated work - do NOT emit findings about those issues' missing functionality.` : '',
    `Inspect '${SOURCE}' via a TEMPORARY detached worktree (git worktree add --detach <tmpdir> ${SOURCE}; remove it when done) - never switch an existing checkout's branch or cd into another clone of this repo. In it: build from a CLEAN state, run the FULL test suite, and review correctness, security, and edge cases - judging whether the integrated whole meets the parent's intent, especially interactions BETWEEN slices, which per-issue review structurally cannot see.`,
    `Return pass:true ONLY if it builds, the suite is green, and the integrated work meets the parent's intent; otherwise pass:false with findings. Do NOT fix anything yourself - a separate remediation stage acts on your findings.`,
    `Your OUTPUT is billed at a premium - be terse everywhere: no narration, no restating the spec, no praise, no code blocks, minimal intermediate notes. Each finding is ONE line: file:line (or module) - what is wrong - the expected behavior per the spec/criterion it violates - a fix pointer if obvious. That one line must let a cheaper remediation agent fix it WITHOUT re-investigating. Terse never means lenient or incomplete: report EVERY real defect - you are the gate that blocks bad code - and nothing that is not a defect.`,
  ].filter(Boolean).join('\n')
  // fable: the one gate worth the premium model - an integrated-whole judgment that blocks bad code from shipping.
  // Verdicts are output-light and the prompt pins the output format, so its per-output-token premium stays small.
  let fr = await agent(prompt, { label: round ? `final-review:r${round}` : 'final-review', phase: 'Final Review', schema: FINAL_REVIEW_SCHEMA, model: 'fable' })
  if (!fr) fr = await agent(prompt, { label: `final-review${round ? `:r${round}` : ''}:retry`, phase: 'Final Review', schema: FINAL_REVIEW_SCHEMA, model: 'fable' })
  if (!fr) return { status: 'unavailable', findings: [] }
  const findings = (fr.findings && fr.findings.length) ? fr.findings
    : (fr.pass ? [] : ['Final review failed without listing findings - independently re-run the full suite and every acceptance criterion, identify the concrete failure, and fix it'])
  return { status: fr.pass ? 'pass' : 'fail', findings }
}

if (anyIntegrated && !input.finalReviewDone) {
  phase('Final Review')
  finalReview = await runFinalReview(0)
  log(`final review: ${finalReview.status.toUpperCase()}`)
  // Remediation loop - same failure taxonomy as the dev loop: a fixer that DECLINES (committed:false) is a
  // capability outcome and climbs the ladder; a null fixer is infrastructure and gets one same-rung retry;
  // only findings surviving the top rung (or an aborted loop) reach the human, as a single structured blocker.
  let lastFindings = finalReview.findings
  let remediationAborted = false
  let fixerInfraRetried = false
  for (let round = 1; finalReview.status === 'fail' && round <= LADDER.length; round++) {
    const tier = LADDER[round - 1]
    const fix = await agent([
      `Remediate final-review findings for ${PARENT} on branch '${SOURCE}'. The per-issue work is already merged and its issues are closed - do NOT reopen, close, or create issues; fix the integrated code itself.`,
      `Findings to fix (fix ONLY these - no scope creep):\n${finalReview.findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}`,
      blockerAnswers.FINAL ? `Resolved guidance from the human: ${blockerAnswers.FINAL}` : '',
      `Work in a TEMPORARY worktree of '${SOURCE}' (git worktree add <tmpdir> ${SOURCE}; remove it when done) - never switch an existing checkout's branch or cd into another clone of this repo. If the add fails because '${SOURCE}' is checked out elsewhere, use a detached worktree (git worktree add --detach <tmpdir> ${SOURCE}), commit on its detached HEAD, then update the branch ref from inside it: git push . HEAD:refs/heads/${SOURCE}`,
      `Run the FULL test suite; commit to '${SOURCE}' ONLY when green, with a conventional-commit message and NO Claude/Anthropic/Co-Authored-By attribution.`,
      `Return committed (true ONLY if a green fix is committed), commitRef, and a 1-3 sentence summary.`,
    ].filter(Boolean).join('\n'), { label: `remediate:r${round}:${tier}`, phase: 'Final Review', schema: REMEDIATE_SCHEMA, model: tier })
    if (!fix) {
      if (!fixerInfraRetried) { fixerInfraRetried = true; round--; continue } // infrastructure - don't burn a rung
      blockers.push({ issue: 'FINAL', reason: 'remediation agent unavailable (infrastructure, after same-rung retry)', findings: finalReview.findings })
      remediationAborted = true
      break
    }
    if (!fix.committed) {
      // Declining to fix is a capability outcome at this rung - record it and climb, exactly like a dev round.
      remediation.push({ round, tier, commitRef: null, summary: `no fix committed: ${fix.summary}` })
      continue
    }
    remediation.push({ round, tier, commitRef: fix.commitRef || null, summary: fix.summary })
    finalReview = await runFinalReview(round)
    if (finalReview.status === 'fail') lastFindings = finalReview.findings
    log(`final review after remediation r${round} (${tier}): ${finalReview.status.toUpperCase()}`)
  }
  if (!remediationAborted && finalReview.status === 'fail') {
    blockers.push({ issue: 'FINAL', reason: `final review findings survived ${remediation.length} remediation round(s) - ladder exhausted`, findings: finalReview.findings })
  } else if (finalReview.status === 'unavailable') {
    const ungraded = remediation.map((r) => r.commitRef).filter(Boolean)
    blockers.push({ issue: 'FINAL', reason: `final review verdict unavailable (infrastructure, after retry)${ungraded.length ? ` - remediation commit(s) ${ungraded.join(', ')} on '${SOURCE}' are UNGRADED` : ''}`, findings: lastFindings })
  }
}

return {
  parent: PARENT,
  integrated: integratedNums,
  integrationOrder,
  commitRefs,
  todos,
  finalReview,
  remediation,
  blocked: blockers,
  notRun: nums().filter((n) => !status[n] && !alreadyIntegrated.has(n)), // halted upstream - never became ready
  graph: GRAPH,
  // Hand `integrated` back via args on a resume so the re-run is idempotent (plus the live reconcile above),
  // and finalReviewDone: true if this run already delivered a final-review verdict.
}
