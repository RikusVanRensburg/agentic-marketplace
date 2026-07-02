export const meta = {
  name: 'workshop',
  description: 'Headless plan→implement→verify→review pipeline for rr:workshop. Per-task two-stage review, gating verification + review loopbacks, defending-findings mindset in every agent. Returns a structured summary; the main session owns state.json.',
  phases: [
    { title: 'Plan' },
    { title: 'Implement' },
    { title: 'Verify' },
    { title: 'Review' },
  ],
}

// args: { slug, ledgerDir, specPath, contextPath, date, resumeStage, tasks?, tasksDone?, verifyCmd? }
//  - tasks:     locked task list for resume (skip the plan agent)
//  - tasksDone: ids already implemented (skip on resume)
//  - verifyCmd: optional explicit test/verify command
// The workshop commits onto the CURRENT branch in the session cwd — it creates no branch
// or worktree (isolation is the operator's responsibility). The workflow NEVER writes
// state.json (no filesystem access); it RETURNS a structured summary the main session persists.
const slug = args.slug
const ledgerDir = args.ledgerDir
const specPath = args.specPath
const contextPath = args.contextPath
const date = args.date
const resumeStage = args.resumeStage || 'plan'
const priorTasks = args.tasks || null
const tasksDone = new Set(args.tasksDone || [])
const verifyCmd = args.verifyCmd || null

const summary = {
  slug: slug, status: 'running', planPath: null, tasks: [],
  tasksDone: [], commits: [], blockers: [], reviewPath: null, verifyEvidence: null,
}

// G2 — fail fast on a missing/malformed date instead of writing "undefined-…md".
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
  log('FATAL: args.date missing or not YYYY-MM-DD ("' + date + '"). The main session must pass a valid date.')
  summary.status = 'error'; summary.reason = 'invalid-date'
  return summary
}

const DEFEND = [
  'MINDSET — defending-findings (guilty until proven innocent):',
  'Every finding, diagnosis, decision, or claim you produce is WRONG by default.',
  'For each load-bearing claim: (1) state it as a single falsifiable claim;',
  '(2) name its calibration class (stakes x direction) out loud;',
  '(3) build the positive case, citing file:line / command output inline;',
  '(4) attack each cited piece — stale file? missed path? coincidence? contradicting sibling?;',
  '(5) survives -> assert with proof attached; fails -> it stays in quarantine, do not ship it.',
  'No hedge words. No "obviously/clearly/must be" without a cited check.',
  'Library and architecture choices are maximum intensity. Run the ritual; never skip it.',
  'You are a subagent — do NOT spawn subagents. Keep incidental notes under the ledger dir, never under docs/superpowers.',
].join('\n')

const TASK_LIST_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['planPath', 'tasks'],
  properties: {
    planPath: { type: 'string' },
    tasks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'title'],
        properties: { id: { type: 'string' }, title: { type: 'string' } },
      },
    },
  },
}
const BUILD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['sha', 'note'],
  properties: { sha: { type: 'string' }, note: { type: 'string' } },
}
const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'issues'],
  properties: { ok: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } } },
}
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['passed', 'evidence'],
  properties: { passed: { type: 'boolean' }, evidence: { type: 'string' } },
}
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['blockers', 'reviewPath'],
  properties: { blockers: { type: 'array', items: { type: 'string' } }, reviewPath: { type: 'string' } },
}

const STAGES = ['plan', 'implement', 'verify', 'review']
let startIdx = STAGES.indexOf(resumeStage)
if (startIdx === -1) {
  log('Unknown resumeStage "' + resumeStage + '" — running the full pipeline from plan.')
  startIdx = 0
}
const planFile = ledgerDir + '/plans/' + date + '-' + slug + '.md'

let tasks = priorTasks

// ---- Stage 1: Plan ----
if (startIdx <= 0) {
  phase('Plan')
  const planResult = await agent(
    DEFEND + '\n\n' +
    'Use the superpowers:writing-plans skill to turn the approved design spec into a ' +
    'bite-sized, TDD, task-by-task implementation plan.\n' +
    '- Design spec: ' + specPath + '\n' +
    '- Glossary/decisions (context): ' + contextPath + '\n' +
    '- Write the plan to ' + planFile + '. ' +
    'Do NOT use the superpowers default docs/superpowers/plans path — this output path overrides it.\n' +
    '- Do NOT write state.json — the main session owns it.\n' +
    'Return the plan path and the ordered list of its tasks (id + title).',
    { label: 'plan:writing-plans', phase: 'Plan', schema: TASK_LIST_SCHEMA }
  )
  summary.planPath = planResult.planPath
  tasks = planResult.tasks
}
summary.planPath = summary.planPath || planFile

// Tasks are only required when the implement stage will actually run (startIdx <= 1).
// A verify/review-only resume (startIdx >= 2) legitimately needs no task list.
if (startIdx <= 1 && (!tasks || !tasks.length)) {
  summary.status = 'error'; summary.reason = 'no-tasks'
  log('No tasks available to implement — stopping.')
  return summary
}
summary.tasks = tasks || []

// ---- Stage 2: Implement — per task: build -> spec-compliance review -> code-quality review.
//      Bounded fix rounds; a task that cannot pass stops the run (no silent advance). ----
if (startIdx <= 1) {
  phase('Implement')
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    if (tasksDone.has(t.id)) { log('Skipping already-done task ' + t.id); continue }
    const where = '- Plan: ' + summary.planPath + '\n- Spec: ' + specPath +
      '\n- Task ' + (i + 1) + '/' + tasks.length + ': [' + t.id + '] ' + t.title + '\n'

    const build = await agent(
      DEFEND + '\n\n' +
      'Implement ONE plan task following the superpowers:subagent-driven-development discipline ' +
      '(TDD: failing test -> see it fail -> minimal implementation -> see it pass -> commit).\n' +
      where +
      '- Do ONLY this task. Commit when green. Return the commit SHA and a one-line note.',
      { label: 'build:' + t.id, phase: 'Implement', schema: BUILD_SCHEMA }
    )
    if (build.sha) summary.commits.push(build.sha)

    let rounds = 0
    let passed = false
    while (rounds < 2) {
      const spec = await agent(
        DEFEND + '\n\n' +
        'SPEC-COMPLIANCE review of the just-implemented task.\n' + where +
        'Set ok=true ONLY if the task is fully and exactly implemented — nothing missing, nothing ' +
        'extra beyond its scope. List concrete issues with file:line. This is correctness-direction: be harsh.',
        { label: 'spec-review:' + t.id, phase: 'Implement', schema: VERDICT_SCHEMA }
      )
      if (!spec.ok) {
        rounds++
        await agent(
          DEFEND + '\n\n' + 'Fix these SPEC-COMPLIANCE issues for task [' + t.id + '] then re-commit:\n- ' +
          spec.issues.join('\n- ') + '\n' + where + 'Do ONLY this. Return when green.',
          { label: 'fix:' + t.id + ':spec', phase: 'Implement' }
        )
        continue
      }
      const qual = await agent(
        DEFEND + '\n\n' +
        'CODE-QUALITY review of the just-implemented task (only after spec-compliance passed).\n' + where +
        'Set ok=true if it is well-built: clear, DRY, no dead code, adequately tested, follows surrounding ' +
        'conventions. List concrete issues with file:line.',
        { label: 'quality-review:' + t.id, phase: 'Implement', schema: VERDICT_SCHEMA }
      )
      if (!qual.ok) {
        rounds++
        await agent(
          DEFEND + '\n\n' + 'Fix these CODE-QUALITY issues for task [' + t.id + '] then re-commit:\n- ' +
          qual.issues.join('\n- ') + '\n' + where + 'Do ONLY this. Return when green.',
          { label: 'fix:' + t.id + ':quality', phase: 'Implement' }
        )
        continue
      }
      passed = true
      break
    }
    if (!passed) {
      summary.status = 'needs_attention'
      summary.blockers.push('Task ' + t.id + ' ("' + t.title + '") failed two-stage review after 2 fix rounds.')
      log('Stopping before verify/review: task ' + t.id + ' could not pass review.')
      return summary
    }
    summary.tasksDone.push(t.id)
  }
}

// ---- Stage 3 + 4: Verify (S2/S3) then Review (G4), sharing one loopback budget (max 2). ----
if (startIdx <= 2) {
  let loop = 0
  const MAX_LOOPBACKS = 2
  while (true) {
    phase('Verify')
    const v = await agent(
      DEFEND + '\n\n' +
      'Use the superpowers:verification-before-completion skill. Run the project verification ' +
      (verifyCmd ? 'command: `' + verifyCmd + '`' : '(discover and run the project test/build command)') + '.\n' +
      'Return passed=true ONLY with evidence: the exact command run and the tail of its output. ' +
      'Correctness-direction — do not claim green without the command output.',
      { label: 'verify', phase: 'Verify', schema: VERIFY_SCHEMA }
    )
    summary.verifyEvidence = v.evidence
    if (!v.passed) {
      if (loop >= MAX_LOOPBACKS) {
        summary.status = 'blocked'
        summary.blockers.push('Verification still failing after ' + MAX_LOOPBACKS + ' loopbacks: ' + v.evidence)
        return summary
      }
      loop++
      await agent(
        DEFEND + '\n\n' + 'Verification failed:\n' + v.evidence + '\nFix the failures (TDD), commit each fix. ' +
        'Plan: ' + summary.planPath,
        { label: 'fix:verify:' + loop, phase: 'Verify' }
      )
      continue
    }

    phase('Review')
    const r = await agent(
      DEFEND + '\n\n' +
      'Use the superpowers:requesting-code-review skill to review the full implementation against the ' +
      'spec (' + specPath + ') and the plan (' + summary.planPath + ').\n' +
      '- Write the review to ' + ledgerDir + '/review/' + date + '-review.md (override the superpowers default path).\n' +
      '- Apply the defending-findings mindset hardest here.\n' +
      'Return blockers[] (empty only if genuinely mergeable) and the reviewPath.',
      { label: 'review', phase: 'Review', schema: REVIEW_SCHEMA }
    )
    summary.reviewPath = r.reviewPath
    if (r.blockers && r.blockers.length) {
      if (loop >= MAX_LOOPBACKS) {
        summary.status = 'blocked'
        summary.blockers = r.blockers
        return summary
      }
      loop++
      await agent(
        DEFEND + '\n\n' + 'Address these review BLOCKERS, committing each fix (TDD):\n- ' +
        r.blockers.join('\n- ') + '\nPlan: ' + summary.planPath,
        { label: 'fix:review:' + loop, phase: 'Review' }
      )
      continue
    }
    break
  }
}

summary.status = 'done'
return summary
