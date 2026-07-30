export const meta = {
  name: 'orchestration',
  description: 'Implement every sub-issue of a GitHub breakdown: dependency-ordered dev (rr-workshop:build-with-tdd, escalating model+effort ladder (default in the script\'s LADDER const)) -> independent QA (opus) -> serialized verified git merge into a dedicated integration branch (opus), then a final integrated review (opus, terse verdicts) with ladder-bounded remediation - circuit breaker throughout, and every blocker written to its issue on the tracker so a resume climbs above the rungs already spent',
  whenToUse: 'Launched by rr-workshop:orchestration after its interactive pre-flight (the Launch gate). Static script - never edited per run (ADR 0002); all per-run data arrives via args: { parent, source, graph, ladder?, integrated?, answers?, rungsTried?, finalReviewDone? }.',
  phases: [
    { title: 'Build', detail: 'dev (rr-workshop:build-with-tdd, worktree-isolated, ladder model) + independent QA (opus) per issue' },
    { title: 'Integrate', detail: 'serialized git merge, post-merge verify, close - in dependency order', model: 'opus' },
    { title: 'Final Review', detail: 'isolated review of the integrated whole + ladder-bounded remediation', model: 'opus' },
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
//   ladder: [{ model: 'sonnet', effort: 'xhigh' }, 'opus'],
//                                                 // optional: escalation ladder for BOTH dev rounds and
//                                                 //   final-review remediation. A rung is { model, effort } -
//                                                 //   or a bare model string, which means effort 'high'.
//                                                 //   model from haiku|sonnet|opus|fable, effort from
//                                                 //   low|medium|high|xhigh|max. Its length IS each loop's
//                                                 //   round budget. For the default, read the LADDER const
//                                                 //   below - it is the only place the default is stated.
//   integrated: [124],                              // optional resume: issue numbers merged in a prior run
//   answers: { 125: 'use approach B',               // optional resume: human answers to prior blockers, by issue number;
//              FINAL: 'guidance' },                 //   the literal key FINAL carries guidance for final-review remediation
//   rungsTried: { 125: 2 },                         // optional resume: rungs a slice already exhausted, read off the
//                                                   //   blocker comment this script leaves on the issue. That slice
//                                                   //   restarts ABOVE them instead of re-burning the ladder from
//                                                   //   rung 1. A count >= ladder length means the whole ladder is
//                                                   //   spent: the slice retries the TOP rung once, on the strength
//                                                   //   of the human's answers[] entry.
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
// Rung resume: how many rungs each slice already burned on a prior run. Validated as strictly as answers[] and
// for the same reason - a silently dropped entry re-burns a full ladder of agents to re-reach a known dead end.
const rungsTried = {}
if (input.rungsTried !== undefined) {
  if (!input.rungsTried || typeof input.rungsTried !== 'object' || Array.isArray(input.rungsTried)) {
    throw new Error('orchestration: args.rungsTried must be an object of issueNumber -> count of rungs already exhausted')
  }
  for (const [k, v] of Object.entries(input.rungsTried)) {
    const num = Number(k)
    if (!GRAPH[num]) throw new Error(`orchestration: args.rungsTried key '${k}' is not an issue in the graph`)
    if (!Number.isInteger(v) || v < 0) throw new Error(`orchestration: args.rungsTried[${k}] must be a non-negative integer`)
    rungsTried[num] = v
  }
}
// Escalation Ladder: round 1 runs the cheapest rung; each QA rejection climbs one; a rejection at the
// top rung trips the breaker. Rounds = rungs, so overriding args.ladder changes rungs AND retry budget at once.
// A rung is { model, effort }. Effort was previously never passed, so every stage ran the API default 'high';
// xhigh now buys a rung between sonnet and opus, so the climb gains reasoning depth before it changes tier.
// A present-but-invalid ladder throws - silently substituting the default would change rungs AND budget
// unnoticed, and a typo'd model or effort would otherwise only fail mid-run at agent-spawn time.
const TIERS = ['haiku', 'sonnet', 'opus', 'fable'] // valid models, cheapest -> smartest
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
// fable stays off the default ladder for three reasons, not one: dev work is output-heavy and fable bills
// output at a premium; its turns run many minutes, which the same-rung infra retry below does not anticipate;
// and prescriptive prompts measurably lower its output quality - devPrompt and qaPrompt are prescriptive by
// necessity, because they also have to carry haiku and sonnet. It stays a valid opt-in rung via args.ladder.
let LADDER = [
  { model: 'sonnet', effort: 'high' },   // sonnet is the dev workhorse
  { model: 'sonnet', effort: 'xhigh' },  // same tier, deeper reasoning, fed round 1's QA defects
  { model: 'opus', effort: 'high' },     // the rescue rung
]
if (input.ladder !== undefined) {
  if (!Array.isArray(input.ladder) || !input.ladder.length) {
    throw new Error('orchestration: args.ladder must be a non-empty array of rungs')
  }
  LADDER = input.ladder.map((rung, i) => {
    // A bare model string stays valid, so legacy ['sonnet','sonnet','opus'] launches keep working unchanged.
    const r = typeof rung === 'string' ? { model: rung } : rung
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      throw new Error(`orchestration: args.ladder[${i}] must be a model string or { model, effort }`)
    }
    if (!TIERS.includes(r.model)) {
      throw new Error(`orchestration: args.ladder[${i}].model must be one of ${TIERS.join('|')}`)
    }
    const effort = r.effort === undefined ? 'high' : r.effort
    if (!EFFORTS.includes(effort)) {
      throw new Error(`orchestration: args.ladder[${i}].effort must be one of ${EFFORTS.join('|')}`)
    }
    return { model: r.model, effort }
  })
}

const handoff = {}   // issueNumber -> note string (passed to dependent DEV prompts ONLY)
const status = {}    // issueNumber -> 'integrated' | 'blocked' | 'descoped'
const blockers = []  // structured escalation records
const integrationOrder = [] // issues in the order they actually merged
const commitRefs = {}       // issueNumber -> merge commit ref
const todos = {}            // issueNumber -> deferred TODOs reported by DEV

// Every blocker lands on the TRACKER as well as in this run's report. The report dies with the session, so a
// blocker that lives only there is invisible to the next run and to the human: they cannot see which rungs the
// slice already burned, and the relaunch re-burns them. This is also the channel args.rungsTried is read from,
// and it is the artifact the relay engine already writes - both engines now leave the same record.
// The comment is built HERE, in the script, so its shape is fixed rather than improvised per run; the agent's
// only job is to put the given text on the given issue.
const escalate = async (rec) => {
  blockers.push(rec)
  // rec.spent is CUMULATIVE across runs, so a resumed slice's comment reports every rung ever spent on it -
  // rec.rounds only counts this run's, and reporting that would let each resume regress the count it just read.
  const spent = typeof rec.spent === 'number' ? rec.spent : (rec.rounds ? rec.rounds.length : 0)
  const target = rec.issue === 'FINAL' ? PARENT : String(rec.issue)
  const body = [
    '## Blocked by the orchestration run',
    '',
    `- **Reason:** ${rec.reason}`,
    rec.tier ? `- **Rung it stopped on:** ${rec.tier}` : '',
    `- **Rungs exhausted:** ${spent} of ${LADDER.length} (${LADDER.map((r) => `${r.model}/${r.effort}`).join(' -> ')})`,
    `- **Integration branch:** ${SOURCE}`,
    rec.conflicts && rec.conflicts.length ? `- **Conflicting paths:** ${rec.conflicts.join(', ')}` : '',
    rec.failureSummary ? `- **Verification failure:** ${rec.failureSummary}` : '',
    '',
    rec.rounds && rec.rounds.length ? `### Rounds tried\n\n${rec.rounds.map((r) => `${r.round}. **${r.tier}** - ${r.outcome || (r.pass ? 'QA passed' : 'QA rejected')}${r.devSummary ? `: ${r.devSummary}` : ''}${r.defects && r.defects.length ? `\n   - defects: ${r.defects.join('; ')}` : ''}`).join('\n')}` : '',
    '',
    rec.lastDefects && rec.lastDefects.length ? `### Defects still open\n\n${rec.lastDefects.map((d) => `- ${d}`).join('\n')}` : '',
    rec.findings && rec.findings.length ? `### Findings still open\n\n${rec.findings.map((f) => `- ${f}`).join('\n')}` : '',
    '',
    rec.issue === 'FINAL'
      ? `To resume: relaunch with guidance in **args.answers.FINAL**. The remediation ladder is scoped to a run, so it starts again from its first rung.`
      : `To resume: relaunch with this slice's answer in **args.answers** and **rungsTried: { ${rec.issue}: ${spent} }**, so the run restarts above the rungs already spent instead of re-burning them.`,
  ].filter((line) => line !== '').join('\n')
  // haiku/low: this posts given text to a given issue. It carries no judgment, so it gets the cheapest rung -
  // and its failure must never fail the run, since the report still holds the blocker either way.
  await agent(
    [
      `Post a comment on GitHub issue ${target} with EXACTLY the body below - do not reword, summarize, add, or drop anything.`,
      `Write the body to a temporary file and post it with: gh issue comment ${target} --body-file <that file>. Then delete the file.`,
      `Do NOT close, reopen, relabel, or otherwise modify the issue - a comment is the only change you make.`,
      `--- BEGIN BODY ---`,
      body,
      `--- END BODY ---`,
    ].join('\n'),
    { label: `blocker-comment:${rec.issue}`, phase: 'Build', model: 'haiku', effort: 'low' }
  )
}

const nums = () => Object.keys(GRAPH).map(Number)
const depsMet = (n) => GRAPH[n].deps.every((d) => status[d] === 'integrated' || alreadyIntegrated.has(d))
const downstreamCount = (n) => nums().filter((m) => GRAPH[m].deps.includes(n)).length
const ready = () =>
  nums()
    .filter((n) => !status[n] && !alreadyIntegrated.has(n) && depsMet(n))
    .sort((a, b) => downstreamCount(b) - downstreamCount(a)) // unblock the most downstream work first

const RECONCILE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    integrated: { type: 'array', items: { type: 'number' }, description: 'closed with reason COMPLETED - the work landed' },
    descoped: { type: 'array', items: { type: 'number' }, description: 'closed on ANY other reason (NOT_PLANNED, or none at all) - never built' },
  },
  required: ['integrated', 'descoped'],
}
const DEV_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    branch: { type: 'string' },
    inProgressSet: { type: 'boolean', description: 'true once state: in-progress was applied' },
    committed: { type: 'boolean', description: 'true once the work is committed to the branch' },
    summary: { type: 'string' },
    newApis: { type: 'string', description: 'new files or APIs downstream issues will touch' },
    todos: { type: 'string', description: 'out-of-scope TODOs deferred to their own issues' },
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
    // One line per finding - the judge is opus, a premium tier; the format keeps verdicts cheap
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
    `Implement issue #${n} ("${GRAPH[n].title}"), a sub-issue of ${PARENT}. You work alone, in your OWN isolated git worktree.`,
    `Invoke rr-workshop:build-with-tdd for issue #${n} - its "issue-driven, unattended" mode. It owns the Full-Context Load, the state:in-progress flip, and the red-green-refactor loop.`,
    `Fork your branch from '${SOURCE}': git checkout -b ${GRAPH[n].branch} ${SOURCE}. '${SOURCE}' is the branch that already carries every integrated upstream slice you build on, which is what makes it the correct base. Keep every git command inside your assigned worktree directory - it is the one clone you have.`,
    `The acceptance criteria + parent spec ARE the approved interface contract: derive the interface from them and proceed. This run is unattended, so your own judgment is the last word on anything they leave open.`,
    `Do this slice's work yourself, here in this worktree. An independent QA stage judges it after you return, so your job ends at green.`,
    `Deliver exactly the slice its acceptance criteria describe. Where you spot work beyond them, record it as a TODO for its own issue and move on.`,
    note ? `Upstream handoff (dependencies already integrated):\n${note}` : '',
    ans,
    `When the loop is green and the full suite passes, commit to branch '${GRAPH[n].branch}' with a conventional-commit message, in your own words only - no Co-Authored-By, no Claude or Anthropic attribution. Your branch is the deliverable; a separate serialized stage integrates it into '${SOURCE}'.`,
    redo,
  ].filter(Boolean).join('\n')
}

// ISOLATED: only the parent reference, the issue number, and a branch pointer. NEVER the dev transcript, dev
// self-report, or handoff note - QA's value IS its independence. Verdicts are output-light by design: no
// adversarial self-attack ritual here - that discipline runs once, in pre-flight, over the graph/edges/branches;
// re-running it per-issue on every rung is exactly the cost matching rr-workshop:build-with-tdd's cheaper QA
// contract trims.
// This prompt INSTANTIATES the plugin's shared judgment mandate (docs/independent-judgment.md) at its
// single-slice scope: read fresh from the tracker, never see the dev's account, build clean, run the full suite,
// check every criterion, return PASS or specific defects. A shipped script cannot dereference that file at
// runtime - the sub-agent resolves no paths - so the rule lives there and this is its wording. Change one,
// check the other; runFinalReview below instantiates the same mandate at its integrated-whole scope.
function qaPrompt(n, branch) {
  return [
    `Independently QA issue #${n}, a sub-issue of ${PARENT}. Form your OWN picture from the source of truth: the tracker and the committed code are your only evidence, and you confirm every claim you meet there against the code yourself.`,
    `Read FRESH before judging: issue #${n}'s body + ALL its comments + acceptance criteria; the parent's body + ALL its comments; and every sibling sub-issue's acceptance criteria (to catch overlap or contradiction).`,
    `The implementation is committed on branch '${branch}'. Inspect it via a TEMPORARY detached worktree (git worktree add --detach <tmpdir> ${branch}; git worktree remove <tmpdir> when done) - keep every git command inside that tmpdir; it is the one checkout you work in. In that worktree: build from a CLEAN state, run the full test suite, and verify EACH acceptance criterion against the parent's intent.`,
    `Return pass:true ONLY if it builds, all tests pass, and every acceptance criterion is met; otherwise pass:false with a specific list of defects.`,
  ].join('\n')
}

async function buildIssue(n) {
  let priorDefects = null
  let infraRetried = false // one same-rung retry per issue for a null (skipped/failed) agent: infrastructure, not capability
  const rounds = []        // per-round escalation record, carried into any blocker for the post-run grilling
  // Rungs a prior run already exhausted are not re-run: re-burning them spends a full ladder of agents to arrive
  // at the state the last run already reached. Capped one below the top so a slice whose whole ladder is spent
  // still gets one attempt at the top rung - what changed since is the human's answers[] entry, not the rungs.
  const burned = Math.min(rungsTried[n] || 0, LADDER.length - 1)
  if (burned) log(`#${n}: resuming above ${burned} exhausted rung(s) - starting at ${LADDER[burned].model}/${LADDER[burned].effort}`)
  for (let round = burned + 1; round <= LADDER.length; round++) {
    const rung = LADDER[round - 1]
    const rungLabel = `${rung.model}/${rung.effort}`
    // isolation:'worktree' gives each DEV its own working tree, so concurrent work-starter `git checkout -b` is safe.
    // model: the ladder rung for this round - QA rejections climb it (reactive escalation, not predictive).
    const dev = await agent(devPrompt(n, priorDefects), { label: `dev:#${n}:r${round}:${rungLabel}`, phase: 'Build', schema: DEV_SCHEMA, isolation: 'worktree', model: rung.model, effort: rung.effort })
    if (!dev) {
      // null = the agent never returned a verdict: infrastructure, OR a safety refusal on this slice's
      // content (current models decline cyber/bio-adjacent work with no error). Same handling either way -
      // one same-rung retry, then a blocker - but the post-run grilling needs to consider both causes.
      if (!infraRetried) { infraRetried = true; round--; continue }
      // tier: rounds[] is still empty on a round-1 null, so the rung must be named here or the blocker
      // carries no tier at all - and the grilling cannot tell a cheap-rung refusal from infrastructure.
      // spent excludes THIS rung: no verdict came back, so the rung was never actually evaluated and a resume
      // must retry it rather than climb past it. It counts the rungs a verdict did come back on.
      status[n] = 'blocked'; await escalate({ issue: n, reason: 'dev agent returned no result - infrastructure or refusal (after same-rung retry)', tier: rungLabel, spent: burned + rounds.length, rounds }); return null
    }
    if (!dev.committed) {
      // A cheap dev failing to deliver a commit is a capability outcome, not an error - it climbs the ladder like a QA rejection.
      rounds.push({ round, tier: rungLabel, outcome: 'dev did not commit', devSummary: dev.summary || '' })
      priorDefects = [`Round ${round} dev (${rungLabel}) failed to produce a committed implementation${dev.summary ? `: ${dev.summary}` : ''}`]
      continue
    }
    // QA pinned opus/high at every rung - the climb gate must out-reason the dev tiers, and verdicts are
    // output-light so the smart model is cheap here. The opus final review backstops the integrated whole.
    const qa = await agent(qaPrompt(n, dev.branch), { label: `qa:#${n}:r${round}`, phase: 'Build', schema: QA_SCHEMA, model: 'opus', effort: 'high' })
    if (!qa) {
      // null = no verdict came back: infrastructure, OR a safety refusal on this slice's content (current
      // models decline cyber/bio-adjacent work with no error). Either way a missing verdict must not escalate
      // the ladder or trip the breaker - one same-rung retry, then a blocker naming both candidate causes.
      if (!infraRetried) { infraRetried = true; round--; continue }
      // tier: as at the dev site - the round's dev rung, since QA itself is pinned.
      // spent excludes THIS rung, as at the dev site - an ungraded rung is a rung still to try.
      status[n] = 'blocked'; await escalate({ issue: n, reason: 'QA agent returned no result - infrastructure or refusal (after same-rung retry)', tier: rungLabel, spent: burned + rounds.length, rounds }); return null
    }
    rounds.push({ round, tier: rungLabel, devSummary: dev.summary, pass: qa.pass, defects: qa.defects || [] })
    if (qa.pass) return { issue: n, branch: dev.branch, dev }
    priorDefects = (qa.defects && qa.defects.length) ? qa.defects : ['QA rejected without listing defects - independently re-verify EVERY acceptance criterion and fix what fails']
  }
  status[n] = 'blocked'
  // spent counts every rung ever spent on this slice, this run's rounds plus any a prior run burned - the number
  // the human hands back as args.rungsTried. reason names both halves so a resumed blocker is not read as a fresh one.
  await escalate({ issue: n, reason: `circuit breaker tripped (ladder exhausted: ${rounds.length} round(s) this run${burned ? `, resumed above ${burned} rung(s) a prior run burned` : ''})`, tier: `${LADDER[LADDER.length - 1].model}/${LADDER[LADDER.length - 1].effort}`, spent: LADDER.length, rounds, lastDefects: priorDefects })
  return null
}

// Resume reconciliation: a session can die after an issue closes but before the report is read.
// Skip anything already CLOSED on the tracker, not just whatever args carried - but CLOSED alone never means
// landed. Integration closes with --reason completed, so `completed` is the mark THIS pipeline writes; any other
// reason is a closure the run cannot vouch for (`not_planned`, which is also where a duplicate lands, or no reason
// at all on a hand-closed issue) and means the slice left the scope WITHOUT being built. Test for `completed`
// positively rather than against the descoped reasons: GitHub is free to add reasons, and an unrecognized one
// read as done would silently skip a slice and let its dependents build on functionality that does not exist.
const descoped = new Set()
const unreconciled = nums().filter((n) => !alreadyIntegrated.has(n))
if (unreconciled.length) {
  const recon = await agent(
    [
      `For each of these issue numbers [${unreconciled.join(', ')}] (all sub-issues of ${PARENT}), read BOTH its state and its close reason: gh issue view <n> --json state,stateReason`,
      `Sort every CLOSED one by that reason. stateReason COMPLETED goes in 'integrated'. EVERY other closed issue goes in 'descoped' - NOT_PLANNED, a reason you do not recognize, or no reason at all. An OPEN issue goes in neither list.`,
      `Casing matters: gh issue view returns these upper-cased (CLOSED, COMPLETED, NOT_PLANNED), while the REST API (gh api) returns state/state_reason lower-cased. Match whichever surface you actually call - a filter written for the other one matches nothing.`,
      `Return { integrated: [...], descoped: [...] } only. Every number appears in at most one list, and you invent no numbers you were not given.`,
    ].join('\n'),
    { label: 'reconcile', phase: 'Build', model: 'haiku', effort: 'low', schema: RECONCILE_SCHEMA }
  )
  ;((recon && recon.integrated) || []).forEach((n) => { if (GRAPH[Number(n)]) alreadyIntegrated.add(Number(n)) })
  ;((recon && recon.descoped) || []).forEach((n) => { if (GRAPH[Number(n)] && !alreadyIntegrated.has(Number(n))) descoped.add(Number(n)) })
}
if (descoped.size) {
  // A descoped slice was never built. Whether its dependents still stand depends on WHY it was descoped, which
  // only the human who closed it knows - so halt rather than guess. This runs before the wave loop, so nothing
  // has been built or merged when it throws, and the throw names every mismatch at once instead of the first.
  const orphaned = [...descoped]
    .map((d) => ({ slice: d, dependents: nums().filter((m) => GRAPH[m].deps.includes(d) && !alreadyIntegrated.has(m) && !descoped.has(m)) }))
    .filter((x) => x.dependents.length)
  if (orphaned.length) {
    throw new Error(
      `orchestration: the graph no longer matches the tracker - ` +
      orphaned.map((x) => `#${x.slice} is closed WITHOUT reason completed (never built), and #${x.dependents.join(', #')} ${x.dependents.length > 1 ? 'depend' : 'depends'} on it`).join('; ') +
      `. Reopen those issues, or relaunch with a graph that accounts for the descoped work.`
    )
  }
  // Nothing depends on them: mark them so the wave loop skips them, the final-review judge is told they are out
  // of scope (via `unintegrated`), and the run report tells them apart from slices that actually landed.
  for (const d of descoped) status[d] = 'descoped'
  log(`descoped (closed without reason completed, never built): ${[...descoped].map((n) => `#${n}`).join(', ')}`)
}

// Integration is pinned off the ladder. Its rung is named in ONE place so the agent options and the tier its
// blocker carries cannot drift apart - a null integrate result is infrastructure OR a refusal, and telling those
// apart in the post-run grilling needs the model that produced it.
const INTEGRATE_RUNG = { model: 'opus', effort: 'high' }
const INTEGRATE_TIER = `${INTEGRATE_RUNG.model}/${INTEGRATE_RUNG.effort}`

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
      `Integrate issue #${b.issue} of ${PARENT}. Work in a TEMPORARY worktree for the target branch (git worktree add <tmpdir> ${SOURCE}; git worktree remove <tmpdir> when done) - keep every git command inside that tmpdir; it is the one checkout you work in. If the add fails because '${SOURCE}' is checked out elsewhere, use a detached worktree (git worktree add --detach <tmpdir> ${SOURCE}), merge on its detached HEAD, and on success update the branch ref from inside it: git push . HEAD:refs/heads/${SOURCE}`,
      `In that worktree: note the current HEAD of '${SOURCE}', then merge branch '${b.branch}' into it using git DIRECTLY - do NOT use the approval-gated /commit skill (a workflow cannot answer its prompt).`,
      `If the merge conflicts, do NOT force or guess: abort the merge and return ok:false with the conflicting file paths.`,
      `After a clean merge, VERIFY it: build and run the full test suite on '${SOURCE}'. A textually clean merge can still be semantically broken by sibling slices that landed after this branch forked. If the suite is red, undo the merge (git reset --hard to the pre-merge HEAD you noted), do NOT close the issue, and return ok:false with failureSummary.`,
      `Only on a VERIFIED merge (suite green): write the merge commit message in your own words only - no Claude/Anthropic/Co-Authored-By attribution. Then close the issue: gh issue close ${b.issue} --reason completed`,
      `Return ok (true ONLY if merged, verified, and closed cleanly), commitRef, conflicts, and failureSummary when verification failed.`,
      // opus: post-merge verification is a judgment call (is the red suite the merge's fault or pre-existing?) that
      // gates a close. Its judgment on conflicts stays capped by design: conflicts abort, they are never resolved.
    ].join('\n'), { label: `integrate:#${b.issue}`, phase: 'Integrate', schema: INTEGRATE_SCHEMA, model: INTEGRATE_RUNG.model, effort: INTEGRATE_RUNG.effort })

    if (intg && intg.ok) { // ok:true means merged, verified, AND closed
      status[b.issue] = 'integrated'
      integrationOrder.push(b.issue)
      commitRefs[b.issue] = intg.commitRef || null
      if (b.dev.todos) todos[b.issue] = b.dev.todos
      handoff[b.issue] = `#${b.issue} (${GRAPH[b.issue].title}) integrated: ${b.dev.summary} New: ${b.dev.newApis || 'none'}. commit: ${intg.commitRef || '(unreported)'}. Deferred TODOs: ${b.dev.todos || 'none'}`
      log(`integrated #${b.issue}`)
    } else {
      status[b.issue] = 'blocked'
      // tier: integration is pinned, so its own rung is the one that produced this - the ladder never applies here.
      // reason: two different cases. A returned ok:false IS the conflict / post-merge-verification outcome; a null
      // result is no verdict at all - infrastructure, OR a safety refusal on this slice's content - and naming the
      // conflict case there would send the post-run grilling after a cause that never applied.
      // spent: 0 - integration is pinned off the ladder, so a failure here exhausted no dev rung. The slice's dev
      // work did land on its branch; what failed is the merge, and a resume re-derives that from the tracker.
      await escalate({ issue: b.issue, reason: intg ? 'integration failed (conflict or post-merge verification)' : 'integrate agent returned no result - infrastructure or refusal', tier: INTEGRATE_TIER, spent: 0, conflicts: (intg && intg.conflicts) || null, failureSummary: (intg && intg.failureSummary) || null })
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

// The judge is pinned off the ladder too, and its rung is named in ONE place for the same reason as
// INTEGRATE_RUNG: the 'unavailable' blocker has to say which model returned no verdict.
const REVIEW_RUNG = { model: 'opus', effort: 'xhigh' }
const REVIEW_TIER = `${REVIEW_RUNG.model}/${REVIEW_RUNG.effort}`

// The judge is reusable: the remediation loop needs a FRESH, isolated re-judgment after every fix - the fixer
// never grades its own work. A null result is never a verdict: it is infrastructure, OR a safety refusal on
// the integrated content (current models decline cyber/bio-adjacent work with no error). Same handling either
// way - one same-judgment retry, then 'unavailable', which the caller MUST surface as a blocker naming both
// candidate causes, because an ungraded state is never a clean run.
const runFinalReview = async (round) => {
  const prompt = [
    `Final review of ${PARENT} as integrated on branch '${SOURCE}'. Form your OWN picture from the source of truth - you know nothing about how the implementation went, and that is deliberate.`,
    `Read FRESH: the parent's body + ALL its comments, and every sub-issue's body + acceptance criteria.`,
    unintegrated.length ? `IN SCOPE: the work that actually integrated on '${SOURCE}'. Sub-issues ${unintegrated.map((n) => `#${n}`).join(', ')} never integrated in this run and a human already holds them, so their functionality is absent by design - your findings cover the integrated slices only.` : '',
    `Inspect '${SOURCE}' via a TEMPORARY detached worktree (git worktree add --detach <tmpdir> ${SOURCE}; remove it when done) - keep every git command inside that tmpdir; it is the one checkout you work in. In it: build from a CLEAN state, run the FULL test suite, and review correctness, security, and edge cases - judging whether the integrated whole meets the parent's intent, especially interactions BETWEEN slices, which per-issue review structurally cannot see.`,
    `Return pass:true ONLY if it builds, the suite is green, and the integrated work meets the parent's intent; otherwise pass:false with findings.`,
    `Report findings only - a separate remediation stage acts on them.`,
    `Your OUTPUT is billed at a premium - be terse everywhere: the findings list is your whole deliverable, so every token you spend goes into it and your working notes stay at what the investigation itself needs. Each finding is ONE line: file:line (or module) - what is wrong - the expected behavior per the spec/criterion it violates - a fix pointer if obvious. That one line must let a cheaper remediation agent fix it WITHOUT re-investigating. Terse never means lenient or incomplete: report EVERY real defect - you are the gate that blocks bad code - and every line you report names one.`,
  ].filter(Boolean).join('\n')
  // opus: the final gate runs opus at xhigh - the same tier as per-issue QA and integration, with deeper
  // reasoning - an integrated-whole judgment that blocks bad code from shipping. Verdicts are output-light
  // and the prompt pins the output format.
  let fr = await agent(prompt, { label: round ? `final-review:r${round}` : 'final-review', phase: 'Final Review', schema: FINAL_REVIEW_SCHEMA, model: REVIEW_RUNG.model, effort: REVIEW_RUNG.effort })
  if (!fr) fr = await agent(prompt, { label: `final-review${round ? `:r${round}` : ''}:retry`, phase: 'Final Review', schema: FINAL_REVIEW_SCHEMA, model: REVIEW_RUNG.model, effort: REVIEW_RUNG.effort })
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
    const rung = LADDER[round - 1]
    const rungLabel = `${rung.model}/${rung.effort}`
    const fix = await agent([
      `Remediate final-review findings for ${PARENT} on branch '${SOURCE}'. The per-issue work is already merged and its issues are closed - put all your work into the integrated code itself, and do NOT reopen, close, or create issues on the tracker.`,
      `Findings to fix - exactly these, and they are the whole scope of this round. Anything else you notice belongs in your summary rather than the diff:\n${finalReview.findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}`,
      blockerAnswers.FINAL ? `Resolved guidance from the human: ${blockerAnswers.FINAL}` : '',
      `Work in a TEMPORARY worktree of '${SOURCE}' (git worktree add <tmpdir> ${SOURCE}; remove it when done) - keep every git command inside that tmpdir; it is the one checkout you work in. If the add fails because '${SOURCE}' is checked out elsewhere, use a detached worktree (git worktree add --detach <tmpdir> ${SOURCE}), commit on its detached HEAD, then update the branch ref from inside it: git push . HEAD:refs/heads/${SOURCE}`,
      `Run the FULL test suite; commit to '${SOURCE}' ONLY when green, with a conventional-commit message in your own words only - no Claude/Anthropic/Co-Authored-By attribution.`,
      `Return committed (true ONLY if a green fix is committed), commitRef, and a 1-3 sentence summary.`,
    ].filter(Boolean).join('\n'), { label: `remediate:r${round}:${rungLabel}`, phase: 'Final Review', schema: REMEDIATE_SCHEMA, model: rung.model, effort: rung.effort })
    if (!fix) {
      // null = no result came back: infrastructure, OR a safety refusal on the findings' content (current
      // models decline cyber/bio-adjacent work with no error). Same handling either way - one same-rung retry
      // that doesn't burn a rung, then a blocker naming both candidate causes.
      if (!fixerInfraRetried) { fixerInfraRetried = true; round--; continue }
      // tier: as at the dev site - remediation[] is still empty on a round-1 null, so the rung must be named
      // here or the blocker carries no tier at all, and the grilling cannot tell a refusal from infrastructure.
      await escalate({ issue: 'FINAL', reason: 'remediation agent returned no result - infrastructure or refusal (after same-rung retry)', tier: rungLabel, spent: remediation.length, findings: finalReview.findings })
      remediationAborted = true
      break
    }
    if (!fix.committed) {
      // Declining to fix is a capability outcome at this rung - record it and climb, exactly like a dev round.
      remediation.push({ round, tier: rungLabel, commitRef: null, summary: `no fix committed: ${fix.summary}` })
      continue
    }
    remediation.push({ round, tier: rungLabel, commitRef: fix.commitRef || null, summary: fix.summary })
    finalReview = await runFinalReview(round)
    if (finalReview.status === 'fail') lastFindings = finalReview.findings
    log(`final review after remediation r${round} (${rungLabel}): ${finalReview.status.toUpperCase()}`)
  }
  if (!remediationAborted && finalReview.status === 'fail') {
    // tier: exhaustion means every rung ran, so the top rung is the one whose fix the findings survived.
    const topRung = LADDER[LADDER.length - 1]
    await escalate({ issue: 'FINAL', reason: `final review findings survived ${remediation.length} remediation round(s) - ladder exhausted`, tier: `${topRung.model}/${topRung.effort}`, spent: remediation.length, findings: finalReview.findings })
  } else if (finalReview.status === 'unavailable') {
    const ungraded = remediation.map((r) => r.commitRef).filter(Boolean)
    // tier: the judge is pinned, so its own rung is the one that returned no verdict - never a ladder rung.
    await escalate({ issue: 'FINAL', reason: `final review returned no verdict - infrastructure or refusal (after retry)${ungraded.length ? ` - remediation commit(s) ${ungraded.join(', ')} on '${SOURCE}' are UNGRADED` : ''}`, tier: REVIEW_TIER, spent: remediation.length, findings: lastFindings })
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
  descoped: nums().filter((n) => status[n] === 'descoped'), // closed without reason completed - never built, nothing depended on them
  notRun: nums().filter((n) => !status[n] && !alreadyIntegrated.has(n)), // halted upstream - never became ready
  graph: GRAPH,
  // Hand `integrated` back via args on a resume so the re-run is idempotent (plus the live reconcile above),
  // and finalReviewDone: true if this run already delivered a final-review verdict.
}
