export const meta = {
  name: 'orchestrated-run',
  description: 'Implement every task in a plan: dependency-ordered dev (TDD, escalating model ladder) -> independent QA (opus) -> serialized verified git merge, then a final consolidated code review — circuit breaker and structured blockers throughout',
  whenToUse: 'Launched by rr:orchestrated-run after its interactive pre-flight (Stage 5). Static script — never edited per run; all per-run data arrives via args: { planPath, source, tasks, ladder?, integrated?, answers?, finalReviewDone? }.',
  phases: [
    { title: 'Build', detail: 'dev (TDD, worktree-isolated, ladder model) + independent QA per task' },
    { title: 'Integrate', detail: 'serialized git merge, post-merge verify — in dependency order' },
    { title: 'Final Review', detail: 'consolidated code review over the full diff', model: 'opus' },
  ],
}

// ---- args contract ----------------------------------------------------------
// This script is shipped with the skill and is NEVER edited per run.
// Everything per-run travels via args:
// {
//   planPath: '<ledger>/plans/<date>-<slug>.md',  // required: path to the approved plan file
//   source: 'orch/<slug>-integration',            // required: a DEDICATED integration branch (created at pre-flight,
//                                                   // forked from the human's actual branch — NEVER the human's own
//                                                   // checked-out branch itself, or every worktree-based integration
//                                                   // attempt below deadlocks against it). DEV forks from this branch
//                                                   // and integration merges into it; the caller merges it back into
//                                                   // the human's branch interactively once the workflow returns.
//   tasks: {                                       // required: full dependency graph of tasks
//     1: { deps: [], title: 'Setup DTOs', description: '...', branch: 'orch/task-1-setup-dtos' },
//     2: { deps: [1], title: 'Add endpoint', description: '...', branch: 'orch/task-2-add-endpoint' },
//   },
//   ladder: ['haiku', 'sonnet', 'opus'],           // optional: escalation tiers (default ['haiku','sonnet','opus'])
//   integrated: [1],                               // optional resume: tasks merged in a prior run
//   answers: { 2: 'use approach B',                // optional: human answers to prior blockers by task id
//              FINAL: 'guidance for final review' },
//   finalReviewDone: true,                         // optional resume: prior run already delivered final review
// }

let input = args
if (typeof input === 'string') {
  try { input = JSON.parse(input) } catch { throw new Error('orchestrated-run: args arrived as a non-JSON string') }
}
if (!input || typeof input !== 'object') throw new Error('orchestrated-run requires args: { planPath, source, tasks, ... }')

const PLAN_PATH = input.planPath
const SOURCE = input.source
if (typeof PLAN_PATH !== 'string' || !PLAN_PATH.trim()) throw new Error('orchestrated-run: args.planPath (string) is required')
if (typeof SOURCE !== 'string' || !SOURCE.trim()) throw new Error('orchestrated-run: args.source (string) is required')
if (!input.tasks || typeof input.tasks !== 'object' || Array.isArray(input.tasks) || !Object.keys(input.tasks).length) {
  throw new Error('orchestrated-run: args.tasks (non-empty object of taskId -> { deps, title, description, branch }) is required')
}

// Rebuild the graph with canonical integer keys.
const GRAPH = {}
for (const [k, node] of Object.entries(input.tasks)) {
  const num = Number(k)
  if (!Number.isInteger(num) || num <= 0) throw new Error(`orchestrated-run: tasks key '${k}' is not a positive integer`)
  if (!node || !Array.isArray(node.deps) || typeof node.title !== 'string' || typeof node.description !== 'string' || typeof node.branch !== 'string' || !node.branch.trim()) {
    throw new Error(`orchestrated-run: tasks node ${k} must be { deps: number[], title: string, description: string, branch: string }`)
  }
  const deps = node.deps.map(Number)
  if (deps.some((d) => !Number.isInteger(d) || d <= 0)) throw new Error(`orchestrated-run: tasks node ${k} has a non-integer dep`)
  GRAPH[num] = { deps, title: node.title, description: node.description, branch: node.branch }
}
for (const [k, node] of Object.entries(GRAPH)) {
  for (const d of node.deps) {
    if (!GRAPH[d]) throw new Error(`orchestrated-run: tasks node ${k} depends on #${d}, which is not in the graph`)
  }
}
// Reject branch collisions NOW: two tasks sharing a branch (or a task branch literally equal to SOURCE) would let
// a `checkout -B` silently clobber one task's work with another's — discovered only after the fact, mid-run.
{
  const branchOwner = {}
  for (const [k, node] of Object.entries(GRAPH)) {
    if (node.branch === SOURCE) throw new Error(`orchestrated-run: tasks node ${k} branch '${node.branch}' must not equal args.source`)
    if (branchOwner[node.branch]) throw new Error(`orchestrated-run: tasks ${branchOwner[node.branch]} and ${k} both use branch '${node.branch}' — branch names must be unique`)
    branchOwner[node.branch] = k
  }
}
// Reject cycles and self-deps.
{
  const state = {}
  const visit = (n, path) => {
    if (state[n] === 2) return
    if (state[n] === 1) throw new Error(`orchestrated-run: dependency cycle in args.tasks: ${[...path, n].join(' -> ')}`)
    state[n] = 1
    for (const d of GRAPH[n].deps) visit(d, [...path, n])
    state[n] = 2
  }
  for (const n of Object.keys(GRAPH).map(Number)) visit(n, [])
}

const alreadyIntegrated = new Set((input.integrated || []).map(Number))
for (const n of alreadyIntegrated) {
  if (!GRAPH[n]) throw new Error(`orchestrated-run: args.integrated contains #${n}, which is not in the tasks graph`)
}

const blockerAnswers = {}
if (input.answers !== undefined) {
  if (!input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) {
    throw new Error('orchestrated-run: args.answers must be an object of taskId -> clarification string')
  }
  for (const [k, v] of Object.entries(input.answers)) {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`orchestrated-run: args.answers[${k}] must be a non-empty string`)
    if (k === 'FINAL') { blockerAnswers.FINAL = v; continue }
    const num = Number(k)
    if (!GRAPH[num]) throw new Error(`orchestrated-run: args.answers key '${k}' is not a task in the graph`)
    blockerAnswers[num] = v
  }
}

const TIERS = ['haiku', 'sonnet', 'opus']
let LADDER = ['haiku', 'sonnet', 'opus']
if (input.ladder !== undefined) {
  if (!Array.isArray(input.ladder) || !input.ladder.length || input.ladder.some((t) => !TIERS.includes(t))) {
    throw new Error(`orchestrated-run: args.ladder must be a non-empty array of tiers from ${TIERS.join('|')}`)
  }
  LADDER = input.ladder
}

const handoff = {}       // taskId -> note string (passed to dependent DEV prompts ONLY)
const status = {}        // taskId -> 'integrated' | 'blocked'
const blockers = []
const integrationOrder = []
const commitRefs = {}
const todos = {}

const nums = () => Object.keys(GRAPH).map(Number)
const depsMet = (n) => GRAPH[n].deps.every((d) => status[d] === 'integrated' || alreadyIntegrated.has(d))
const downstreamCount = (n) => nums().filter((m) => GRAPH[m].deps.includes(n)).length
const ready = () =>
  nums()
    .filter((n) => !status[n] && !alreadyIntegrated.has(n) && depsMet(n))
    .sort((a, b) => downstreamCount(b) - downstreamCount(a))

const DEV_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    branch: { type: 'string' },
    committed: { type: 'boolean', description: 'true once the work is committed to the branch' },
    summary: { type: 'string' }, newApis: { type: 'string' }, todos: { type: 'string' },
  },
  required: ['branch', 'committed', 'summary'],
}
const QA_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { pass: { type: 'boolean' }, defects: { type: 'array', items: { type: 'string' } } },
  required: ['pass'],
}
const INTEGRATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { ok: { type: 'boolean' }, commitRef: { type: 'string' }, conflicts: { type: 'array', items: { type: 'string' } }, failureSummary: { type: 'string' } },
  required: ['ok'],
}
const FINAL_REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { pass: { type: 'boolean' }, blockers: { type: 'array', items: { type: 'string' } }, nits: { type: 'array', items: { type: 'string' } } },
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
  const redo = priorDefects ? `\n\nPrevious QA REJECTED with: ${JSON.stringify(priorDefects)} — fix exactly these.` : ''
  return [
    `Implement task #${n} from the plan at ${PLAN_PATH}. You run in your OWN isolated git worktree, so you cannot collide with other DEV agents.`,
    `Task title: "${GRAPH[n].title}"`,
    `Task description: ${GRAPH[n].description}`,
    `Read the full plan at ${PLAN_PATH} first to understand the full context and how this task fits. Then implement using superpowers:test-driven-development.`,
    `BRANCH BASE IS NON-NEGOTIABLE: create the branch FROM '${SOURCE}' (git checkout -B ${GRAPH[n].branch} ${SOURCE} — use -B, not -b: a prior rejected round may have left this branch name behind, and -B resets it fresh from SOURCE instead of erroring) inside your assigned worktree — never from main or whatever HEAD you find; '${SOURCE}' already contains every integrated upstream task you build on. Perform ALL git operations inside your assigned worktree directory — never cd into another clone or worktree of this repo.`,
    `Do NOT spawn any QA sub-agent — you cannot spawn sub-agents; an independent QA stage runs after you return.`,
    note ? `Upstream handoff (dependencies already integrated):\n${note}` : '',
    ans,
    `When tests are green and the full suite passes, COMMIT your work to branch '${GRAPH[n].branch}' with a conventional-commit message and NO Claude/Anthropic/Co-Authored-By attribution. Do NOT merge into ${SOURCE} — integration is a separate serialized stage.`,
    `Return: the branch name, committed (did you commit?), a 1-3 sentence summary, any new files/APIs downstream tasks will touch, and any out-of-scope TODOs.`,
    redo,
  ].filter(Boolean).join('\n')
}

function qaPrompt(n, branch) {
  return [
    `Independently QA task #${n} from the plan at ${PLAN_PATH}. Form your OWN picture from the source of truth — do not trust any prior report.`,
    `Task title: "${GRAPH[n].title}"`,
    `Task description: ${GRAPH[n].description}`,
    `Read the full plan at ${PLAN_PATH} FRESH to understand the acceptance criteria and how this task fits the whole.`,
    `The implementation is committed on branch '${branch}'. Inspect it via a TEMPORARY detached worktree (git worktree add --detach <tmpdir> ${branch}; git worktree remove <tmpdir> when done) — NEVER switch the branch of an existing checkout or cd into another clone of this repo. In that worktree: build from a CLEAN state, run the full test suite, and verify every acceptance criterion against the plan's intent.`,
    `Return pass:true ONLY if it builds, all tests pass, and every acceptance criterion is met; otherwise pass:false with a specific list of defects.`,
  ].join('\n')
}

async function buildTask(n) {
  let priorDefects = null
  let infraRetried = false // one same-rung retry per task for a null (skipped/failed) agent: infrastructure, not capability
  const rounds = []
  for (let round = 1; round <= LADDER.length; round++) {
    const tier = LADDER[round - 1]
    const dev = await agent(devPrompt(n, priorDefects), { label: `dev:#${n}:r${round}:${tier}`, phase: 'Build', schema: DEV_SCHEMA, isolation: 'worktree', model: tier })
    if (!dev) {
      if (!infraRetried) { infraRetried = true; round--; continue }
      status[n] = 'blocked'; blockers.push({ task: n, reason: 'dev agent unavailable (infrastructure, after same-rung retry)', rounds }); return null
    }
    if (!dev.committed) {
      rounds.push({ round, tier, outcome: 'dev did not commit', devSummary: dev.summary || '' })
      priorDefects = [`Round ${round} dev (${tier}) failed to produce a committed implementation${dev.summary ? `: ${dev.summary}` : ''}`]
      continue
    }
    const qa = await agent(qaPrompt(n, dev.branch), { label: `qa:#${n}:r${round}`, phase: 'Build', schema: QA_SCHEMA, model: 'opus' })
    if (!qa) {
      if (!infraRetried) { infraRetried = true; round--; continue }
      status[n] = 'blocked'; blockers.push({ task: n, reason: 'QA agent unavailable (infrastructure, after same-rung retry)', rounds }); return null
    }
    rounds.push({ round, tier, devSummary: dev.summary, pass: qa.pass, defects: qa.defects || [] })
    if (qa.pass) return { task: n, branch: dev.branch, dev }
    priorDefects = (qa.defects && qa.defects.length) ? qa.defects : ['QA rejected without listing defects — independently re-verify every acceptance criterion and fix what fails']
  }
  status[n] = 'blocked'
  blockers.push({ task: n, reason: `circuit breaker tripped (ladder exhausted after ${LADDER.length} rounds)`, rounds, lastDefects: priorDefects })
  return null
}

// Resume reconciliation: a session can die after a merge lands on SOURCE but before the report is read. Ask git
// directly (not the caller's args.integrated, which may be stale or absent) whether each not-yet-integrated task's
// branch is already merged into SOURCE, so a crash-and-resume doesn't rebuild work that's already landed.
const unreconciled = nums().filter((n) => !alreadyIntegrated.has(n))
if (unreconciled.length) {
  const recon = await agent(
    [
      `For branch '${SOURCE}', check EACH of these task branches and report which are already merged into it — use git merge-base --is-ancestor <branch> ${SOURCE} (exit 0 = merged); treat a branch that doesn't exist as NOT merged:`,
      ...unreconciled.map((n) => `- task #${n}: branch '${GRAPH[n].branch}'`),
      `Return { integrated: [taskIds] } — ONLY task ids whose branch tip is a verified ancestor of '${SOURCE}'.`,
    ].join('\n'),
    { label: 'reconcile', phase: 'Build', model: 'haiku', schema: { type: 'object', additionalProperties: false, properties: { integrated: { type: 'array', items: { type: 'number' } } }, required: ['integrated'] } }
  )
  ;((recon && recon.integrated) || []).forEach((n) => { if (GRAPH[Number(n)]) alreadyIntegrated.add(Number(n)) })
}

phase('Build')
let wave
while ((wave = ready()).length) {
  const built = await parallel(wave.map((n) => () => buildTask(n)))
  phase('Integrate')
  for (const b of built.filter(Boolean)) {
    const intg = await agent([
      `Integrate task #${b.task} (${GRAPH[b.task].title}) from plan ${PLAN_PATH}. Work in a TEMPORARY worktree for the target branch (git worktree add <tmpdir> ${SOURCE}; git worktree remove <tmpdir> when done) — NEVER switch the branch of an existing checkout and never cd into another clone of this repo. If the add fails because '${SOURCE}' is checked out elsewhere, use a detached worktree (git worktree add --detach <tmpdir> ${SOURCE}), merge on its detached HEAD, and on success update the branch ref: git push . HEAD:refs/heads/${SOURCE}`,
      `In that worktree: note the current HEAD of '${SOURCE}', then merge branch '${b.branch}' into it using git DIRECTLY — do NOT use the approval-gated /commit skill (a workflow cannot answer its prompt).`,
      `If the merge conflicts, do NOT force or guess: abort the merge and return ok:false with the conflicting file paths.`,
      `After a clean merge, VERIFY it: build and run the full test suite on '${SOURCE}'. If the suite is red, undo the merge (git reset --hard to the pre-merge HEAD), and return ok:false with failureSummary.`,
      `Only on a VERIFIED merge (suite green): the merge commit message must carry NO Claude/Anthropic/Co-Authored-By attribution.`,
      `Return ok (true ONLY if merged and verified cleanly), commitRef, conflicts, and failureSummary when verification failed.`,
    ].join('\n'), { label: `integrate:#${b.task}`, phase: 'Integrate', schema: INTEGRATE_SCHEMA, model: 'sonnet' })

    if (intg && intg.ok) {
      status[b.task] = 'integrated'
      integrationOrder.push(b.task)
      commitRefs[b.task] = intg.commitRef || null
      if (b.dev.todos) todos[b.task] = b.dev.todos
      handoff[b.task] = `#${b.task} (${GRAPH[b.task].title}) integrated: ${b.dev.summary} New: ${b.dev.newApis || 'none'}. commit: ${intg.commitRef || '(unreported)'}. Deferred TODOs: ${b.dev.todos || 'none'}`
      log(`integrated #${b.task}`)
    } else {
      status[b.task] = 'blocked'
      blockers.push({ task: b.task, reason: 'integration failed (conflict or post-merge verification)', conflicts: (intg && intg.conflicts) || null, failureSummary: (intg && intg.failureSummary) || null })
      log(`BLOCKED #${b.task} at integration — its dependents will not run`)
    }
  }
  phase('Build')
}

// Final Review: one pass over the whole diff on SOURCE vs the base commit before the first task landed.
// Uses superpowers:requesting-code-review discipline — opus, isolated context, judges the whole change.
const integratedNums = nums().filter((n) => status[n] === 'integrated')
const anyIntegrated = integratedNums.length > 0 || alreadyIntegrated.size > 0
let finalReview = { status: 'skipped', blockers: [], nits: [] }
const remediation = []

const unintegrated = nums().filter((n) => status[n] !== 'integrated' && !alreadyIntegrated.has(n))

const runFinalReview = async (round) => {
  const prompt = [
    `Final code review of the changes on branch '${SOURCE}' against the plan at ${PLAN_PATH}. Form your OWN picture from the source of truth — do not trust any prior report or summary.`,
    `Read FRESH: the plan at ${PLAN_PATH} in full; then inspect the diff on '${SOURCE}' (git diff <base>...HEAD or equivalent).`,
    unintegrated.length ? `OUT OF SCOPE: tasks ${unintegrated.map((n) => `#${n}`).join(', ')} did NOT integrate in this run and are already escalated to a human. Review ONLY the integrated work — do NOT emit findings about missing functionality from those tasks.` : '',
    `Apply superpowers:requesting-code-review discipline: check correctness, security, edge cases, and whether the integrated whole meets the plan's intent — especially interactions between tasks that per-task review structurally cannot see.`,
    `Return pass:true ONLY if the diff is correct and meets the plan's intent; otherwise pass:false with specific actionable blockers (must-fix) and nits (optional). Do NOT fix anything yourself.`,
    blockerAnswers.FINAL ? `Resolved guidance from the human: ${blockerAnswers.FINAL}` : '',
  ].filter(Boolean).join('\n')
  let fr = await agent(prompt, { label: round ? `final-review:r${round}` : 'final-review', phase: 'Final Review', schema: FINAL_REVIEW_SCHEMA, model: 'opus' })
  if (!fr) fr = await agent(prompt, { label: `final-review${round ? `:r${round}` : ''}:retry`, phase: 'Final Review', schema: FINAL_REVIEW_SCHEMA, model: 'opus' })
  if (!fr) return { status: 'unavailable', blockers: [], nits: [] }
  const reviewBlockers = (fr.blockers && fr.blockers.length) ? fr.blockers
    : (fr.pass ? [] : ['Final review failed without listing blockers — re-read the full plan and diff, identify the concrete issue, and fix it'])
  return { status: fr.pass ? 'pass' : 'fail', blockers: reviewBlockers, nits: fr.nits || [] }
}

if (anyIntegrated && !input.finalReviewDone) {
  phase('Final Review')
  finalReview = await runFinalReview(0)
  log(`final review: ${finalReview.status.toUpperCase()}`)

  let remediationAborted = false
  let fixerInfraRetried = false
  for (let round = 1; finalReview.status === 'fail' && round <= LADDER.length; round++) {
    const tier = LADDER[round - 1]
    const fix = await agent([
      `Remediate final review blockers for the plan at ${PLAN_PATH} on branch '${SOURCE}'. The per-task work is already merged — fix the integrated code directly.`,
      `Blockers to fix (fix ONLY these — no scope creep):\n${finalReview.blockers.map((f, i) => `${i + 1}. ${f}`).join('\n')}`,
      blockerAnswers.FINAL ? `Resolved guidance from the human: ${blockerAnswers.FINAL}` : '',
      `Work in a TEMPORARY worktree of '${SOURCE}' (git worktree add <tmpdir> ${SOURCE}; remove it when done) — never switch an existing checkout's branch or cd into another clone of this repo. If the add fails because '${SOURCE}' is checked out elsewhere, use a detached worktree and push the ref back.`,
      `Run the FULL test suite; commit to '${SOURCE}' ONLY when green, with a conventional-commit message and NO Claude/Anthropic/Co-Authored-By attribution.`,
      `Return committed (true ONLY if a green fix is committed), commitRef, and a 1-3 sentence summary.`,
    ].filter(Boolean).join('\n'), { label: `remediate:r${round}:${tier}`, phase: 'Final Review', schema: REMEDIATE_SCHEMA, model: tier })

    if (!fix) {
      if (!fixerInfraRetried) { fixerInfraRetried = true; round--; continue }
      blockers.push({ task: 'FINAL', reason: 'remediation agent unavailable (infrastructure, after same-rung retry)', findings: finalReview.blockers })
      remediationAborted = true
      break
    }
    if (!fix.committed) {
      remediation.push({ round, tier, commitRef: null, summary: `no fix committed: ${fix.summary}` })
      continue
    }
    remediation.push({ round, tier, commitRef: fix.commitRef || null, summary: fix.summary })
    finalReview = await runFinalReview(round)
    log(`final review after remediation r${round} (${tier}): ${finalReview.status.toUpperCase()}`)
  }
  if (!remediationAborted && finalReview.status === 'fail') {
    blockers.push({ task: 'FINAL', reason: `final review blockers survived ${remediation.length} remediation round(s) — ladder exhausted`, findings: finalReview.blockers })
  } else if (finalReview.status === 'unavailable') {
    const ungraded = remediation.map((r) => r.commitRef).filter(Boolean)
    blockers.push({ task: 'FINAL', reason: `final review verdict unavailable (infrastructure, after retry)${ungraded.length ? ` — remediation commit(s) ${ungraded.join(', ')} on '${SOURCE}' are UNGRADED` : ''}`, findings: finalReview.blockers })
  }
}

return {
  planPath: PLAN_PATH,
  integrated: integratedNums,
  integrationOrder,
  commitRefs,
  todos,
  finalReview,
  remediation,
  blocked: blockers,
  notRun: nums().filter((n) => !status[n] && !alreadyIntegrated.has(n)),
  graph: GRAPH,
}
