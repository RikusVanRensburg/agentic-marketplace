// The run as a pure state machine: `start` and `step` take the state and one event and return
// the next state and the effects to carry out. Nothing here touches git, agents or the
// tracker; register.tsx does, and feeds each outcome back in as an event. The state is what
// `$.store` keeps, so a reload or a new session picks the run up where it stood.
//
// The mod orchestrates and checks; agents do every piece of work that can go wrong. Merging,
// building and testing belong to the merge agent, and the mod only reads git to check its work.
// Every outcome, an agent's report or its absence, comes back as an event the run decides on.

import type { Config, Mode, Rung } from './config'
import { rungLabel } from './config'
import type { Closed, Plan } from './plan'
import { integrationBranchOf, sliceBranchOf } from './plan'

export type Role = 'dev' | 'qa' | 'final-qa' | 'remediate' | 'resolve' | 'merge'

export type Phase =
  | 'waiting' // deps not merged yet
  | 'starting' // worktree being created
  | 'dev'
  | 'checking' // dev reported a commit; the mod checks the tree
  | 'qa'
  | 'queued' // QA passed, waiting for integration
  | 'integrating' // in the merge agent's batch
  | 'resolving' // its merge conflicted or went red; an agent merges the integration branch into the slice
  | 'merged'
  | 'landed' // closed as completed before this run
  | 'descoped' // closed otherwise before this run, nothing depends on it
  | 'blocked'
  | 'halted' // an upstream slice is blocked

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number }

export type Verdict = 'pass' | 'fail' | 'no-commit' | 'dirty' | 'no-report' | 'refusal' | 'lost'

export type Round = {
  round: number
  role: Role
  rung: Rung
  startedAt: number
  endedAt?: number
  verdict?: Verdict
  defects?: string[]
  summary?: string
  usage?: Usage
  durationMs?: number
}

export type DevReport = { kind: 'dev'; committed: boolean; summary: string; newApis?: string; todos?: string }
// criteria: one verdict per slice QA was asked to check; required after a resolve.
export type CriterionVerdict = { slice: string; met: boolean; note?: string }
export type QaReport = { kind: 'qa'; pass: boolean; defects: string[]; criteria?: CriterionVerdict[] }
export type FinalReport = { kind: 'final-qa'; pass: boolean; findings: string[] }
export type FixReport = { kind: 'remediate'; committed: boolean; summary: string }
// resolved: the conflict is resolved and committed; otherwise `conflict` says why the two
// slices' requirements cannot both hold. notReproduced: the merged suite went red, but not on
// the slice branch with the integration branch merged in.
export type ResolveReport = { kind: 'resolve'; resolved: boolean; summary: string; conflict?: string; notReproduced?: boolean }
// How one slice of a merge batch ended. red: the build or suite failed twice with it merged
// and passed without it; failing names what failed.
export type MergeOutcome = 'merged' | 'conflict' | 'red' | 'not-tried'
export type SliceMerge = { slice: string; outcome: MergeOutcome; conflicts?: string[]; failing?: string[] }
// baseRed: the integration branch fails without the batch, so nothing in it can be judged;
// failing names what fails there. flaky: what failed once and passed when run again.
export type MergeReport = { kind: 'merge'; baseRed: boolean; failing: string[]; slices: SliceMerge[]; flaky: string[]; summary: string }
// cannotRun: the agent could not attempt the work at all (its worktree missing, a tool it
// needs refused). That is infrastructure, not a verdict: no rung is spent on it.
export type Report = (DevReport | QaReport | FinalReport | FixReport | ResolveReport | MergeReport) & { cannotRun?: string }

export type SliceState = {
  id: string
  repo: string
  branch: string
  mode: Mode
  phase: Phase
  // 1-based rung on the slice's ladder.
  round: number
  infraRetried: boolean
  defects: string[] | null
  rounds: Round[]
  worktree?: string
  baseSha?: string
  commit?: string
  dev?: DevReport
  blocker?: string
  // The person's answer to this slice's last blocker, given to every dev round after it.
  answer?: string
  // The phase the slice was in when it blocked, so an answer resumes it from there.
  stoppedIn?: Phase
  // True when an agent could not run (refused, no report twice), not when its work failed.
  stoppedOnInfra?: boolean
  // When the slice merged, so a later conflict can name the slices merged after it started.
  mergedAt?: number
  // The last merge conflict: the files, and how many resolve rounds it has had.
  conflicts?: string[]
  // What went red when the merge agent merged the slice, for the resolve agent.
  mergeFailures?: string[]
  resolveAttempts?: number
  // The next dev round starts over from baseSha (takeover fresh); the dev resets the tree.
  isFresh?: boolean
  // The check and QA in progress follow a resolve rather than a dev round.
  isAfterResolve?: boolean
  // Dropped from the run by the person (/orchestrator drop).
  isDropped?: boolean
}

export type FinalPhase = 'idle' | 'judging' | 'fixing' | 'pass' | 'blocked' | 'skipped'

export type FinalState = {
  repo: string
  phase: FinalPhase
  // Remediation rounds spent; the judge's own runs do not count.
  round: number
  infraRetried: boolean
  findings: string[]
  rounds: Round[]
  answer?: string
}

export type AgentRef = {
  key: string
  agentId?: string
  role: Role
  slice?: string
  repo: string
  round: number
  rung: Rung
  startedAt: number
  report?: Report
}

export type Blocker = {
  // A slice id, `final:<repo>` or `integration:<repo>`.
  at: string
  reason: string
  rung?: string
  defects?: string[]
  worktree?: string
  time: number
}

export type IntegrationState = {
  branch: string
  path?: string
  // The worktree exists and its baseline is green: slices may start.
  isReady: boolean
  // The slices the merge agent has in hand; [] for the baseline check, null when none.
  merging: string[] | null
  // Where the batch is: the mod reading HEAD, the agent at work, the mod checking its work.
  step?: 'head' | 'agent' | 'check'
  // The HEAD the batch started from. Every attempt at the batch starts there again.
  before?: string
  report?: MergeReport
  // 1-based rung on the merge ladder, for this batch.
  round: number
  infraRetried: boolean
  rounds: Round[]
  // Tests that failed once and passed when run again, across the run.
  flaky: string[]
  // The person's answer to the integration blocker, for the merge agent.
  answer?: string
}

export type RunStatus = 'running' | 'done' | 'aborted'

export type RunState = {
  id: string
  plan: Plan
  config: Config
  status: RunStatus
  startedAt: number
  endedAt?: number
  integration: Record<string, IntegrationState>
  slices: Record<string, SliceState>
  order: string[]
  queue: string[]
  agents: Record<string, AgentRef>
  finals: Record<string, FinalState>
  blockers: Blocker[]
  handoff: Record<string, string>
  seq: number
}

export type LogEntry = {
  run: string
  at: string
  role: Role
  mode: Mode | null
  round: number
  model: string
  effort: string
  verdict: Verdict
  durationMs: number | null
  usage: Usage | null
  startedAt: number
  endedAt: number
}

export type Effect =
  | { kind: 'create-integration'; repo: string }
  | { kind: 'create-slice'; slice: string }
  | { kind: 'check-dev'; slice: string }
  | { kind: 'spawn'; key: string; role: Role; repo: string; slice?: string; round: number; rung: Rung }
  // Read-only: the integration HEAD a batch starts from, refused when the tree is dirty.
  | { kind: 'read-head'; repo: string }
  // Read-only: the merge agent's work is what it reported, and only clean merges landed.
  | { kind: 'check-merge'; repo: string; before: string; merged: string[]; unmerged: string[] }
  | { kind: 'remove-slice'; slice: string }
  | { kind: 'close-issue'; slice: string }
  | { kind: 'blocker'; blocker: Blocker }
  | { kind: 'log'; entry: LogEntry }
  | { kind: 'finished' }

export type EndReason = 'answer' | 'aborted' | 'refusal' | 'error' | 'lost'

export type Event =
  | { kind: 'integration-ready'; repo: string; path: string }
  | { kind: 'integration-failed'; repo: string; reason: string }
  | { kind: 'slice-ready'; slice: string; path: string; baseSha: string }
  | { kind: 'slice-failed'; slice: string; reason: string }
  | { kind: 'spawned'; key: string; agentId: string }
  | { kind: 'spawn-failed'; key: string; reason: string }
  | { kind: 'report'; agentId: string; report: Report }
  | { kind: 'ended'; agentId: string; reason: EndReason; usage?: Usage; durationMs?: number }
  | { kind: 'dev-checked'; slice: string; isClean: boolean; isAdvanced: boolean }
  | { kind: 'head-read'; repo: string; head: string }
  | { kind: 'head-failed'; repo: string; reason: string }
  // problem: why the merge agent's work does not check out, or null. commits: each merged
  // slice branch's merge commit.
  | { kind: 'merge-checked'; repo: string; problem: string | null; commits: Record<string, string> }
  | { kind: 'abort' }
  // The person answered a blocker: `at` is a slice id or `final:<repo>`.
  | { kind: 'retry'; at: string; answer: string }
  // The person took a slice out of the run; its dependents stay halted.
  | { kind: 'drop'; slice: string }

export type Step = { state: RunState; effects: Effect[] }

// Resolve rounds a conflict or a red merge gets before it reaches the person.
export const RESOLVE_ATTEMPTS = 2

// The slices merged after this one started: the ones its merge can collide with.
export function collidedWith(state: RunState, id: string): string[] {
  const slice = state.slices[id]
  const started = slice?.rounds[0]?.startedAt ?? 0
  return Object.values(state.slices)
    .filter(s => s.id !== id && s.repo === slice?.repo && s.mergedAt !== undefined && s.mergedAt >= started)
    .map(s => s.id)
}

// After a resolve, QA's own pass is not enough: it must report every required slice's
// criteria as met. A missing or unmet verdict fails it, in code.
export function unmetCriteria(state: RunState, id: string, report: QaReport): string[] {
  const required = [id, ...collidedWith(state, id)]
  return required.flatMap(s => {
    const verdict = report.criteria?.find(c => c.slice === s)
    if (!verdict) return [`QA reported no criteria verdict for ${s}`]
    return verdict.met ? [] : [`${s}'s acceptance criteria no longer hold${verdict.note ? `: ${verdict.note}` : ''}`]
  })
}

const ACTIVE: readonly Phase[] = ['starting', 'dev', 'checking', 'qa', 'resolving']
const UNFINISHED: readonly Phase[] = ['waiting', 'starting', 'dev', 'checking', 'qa', 'queued', 'integrating', 'resolving']
const DONE: readonly Phase[] = ['merged', 'landed']

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

// --- start

export function start(plan: Plan, config: Config, closed: Closed, id: string, now: number): Step {
  const completed = new Set(closed.completed)
  const other = new Set(closed.other)
  const branch = integrationBranchOf(plan)
  const state: RunState = {
    id,
    plan,
    config,
    status: 'running',
    startedAt: now,
    integration: Object.fromEntries(
      Object.keys(plan.repos).map(repo => [repo, { branch, isReady: false, merging: null, round: 1, infraRetried: false, rounds: [], flaky: [] }]),
    ),
    slices: {},
    order: plan.slices.map(s => s.id),
    queue: [],
    agents: {},
    finals: Object.fromEntries(Object.keys(plan.repos).map(repo => [repo, { repo, phase: 'idle', round: 0, infraRetried: false, findings: [], rounds: [] }])),
    blockers: [],
    handoff: {},
    seq: 0,
  }

  for (const slice of plan.slices) {
    state.slices[slice.id] = {
      id: slice.id,
      repo: slice.repo,
      branch: sliceBranchOf(plan, slice),
      mode: slice.mode,
      phase: completed.has(slice.id) ? 'landed' : other.has(slice.id) ? 'descoped' : 'waiting',
      round: 1,
      infraRetried: false,
      defects: null,
      rounds: [],
    }
  }

  const effects: Effect[] = Object.keys(plan.repos).map(repo => ({ kind: 'create-integration', repo }))

  schedule(state, now, effects)
  return { state, effects }
}

// --- step

export function step(prev: RunState, event: Event, now: number): Step {
  const state = clone(prev)
  const effects: Effect[] = []

  if (event.kind === 'drop') {
    drop(state, effects, event.slice, now)
    return { state, effects }
  }

  if (event.kind === 'retry' && state.status === 'done') {
    state.status = 'running'
    delete state.endedAt
    // Anything merged after the reopening makes the old verdicts stale: every final QA runs again.
    for (const final of Object.values(state.finals)) {
      final.phase = 'idle'
      final.round = 0
      final.findings = []
      final.infraRetried = false
    }
  }

  if (state.status !== 'running') {
    return { state, effects }
  }

  switch (event.kind) {
    case 'abort':
      state.status = 'aborted'
      state.endedAt = now
      return { state, effects }

    case 'retry':
      retry(state, effects, event.at, event.answer, now)
      break

    case 'integration-ready': {
      // The worktree is there; nothing starts until the merge agent finds its baseline green.
      const integration = state.integration[event.repo]
      if (integration && integration.merging === null) {
        integration.path = event.path
        integration.isReady = false
        startBatch(state, effects, event.repo, [])
      }
      break
    }

    case 'integration-failed':
      block(state, effects, `integration:${event.repo}`, event.reason, now)
      for (const slice of Object.values(state.slices)) {
        if (slice.repo === event.repo && UNFINISHED.includes(slice.phase)) {
          slice.phase = 'halted'
          slice.blocker = `integration branch of ${event.repo} unavailable`
        }
      }
      break

    case 'slice-ready': {
      const slice = state.slices[event.slice]
      if (slice && slice.phase === 'starting') {
        slice.worktree = event.path
        slice.baseSha = event.baseSha
        spawnDev(state, effects, slice, now)
      }
      break
    }

    case 'slice-failed': {
      const slice = state.slices[event.slice]
      if (slice) blockSlice(state, effects, slice, `worktree not created: ${event.reason}`, now)
      break
    }

    case 'spawned': {
      const ref = state.agents[event.key]
      if (ref) ref.agentId = event.agentId
      break
    }

    case 'spawn-failed': {
      const ref = state.agents[event.key]
      if (ref) {
        const round = roundOf(state, ref)
        if (round) {
          round.endedAt = now
          round.verdict = 'no-report'
        }
        delete state.agents[event.key]
        failAgent(state, effects, ref, `spawn refused: ${event.reason}`, now)
      }
      break
    }

    case 'report': {
      const ref = agentOf(state, event.agentId)
      if (ref && ref.role === event.report.kind) ref.report = event.report
      break
    }

    case 'ended': {
      const ref = agentOf(state, event.agentId)
      if (ref) {
        delete state.agents[ref.key]
        ended(state, effects, ref, event, now)
      }
      break
    }

    case 'dev-checked': {
      const slice = state.slices[event.slice]
      if (slice && slice.phase === 'checking' && slice.isAfterResolve) {
        if (event.isClean && event.isAdvanced) {
          slice.phase = 'qa'
          spawn(state, effects, 'qa', slice.repo, slice.id, slice.round, state.config.qa, now)
        } else {
          resolveAgain(state, effects, slice, ['the resolve left the worktree dirty or committed nothing; commit the resolved merge'], now)
        }
      } else if (slice && slice.phase === 'checking') {
        if (event.isClean && event.isAdvanced) {
          slice.phase = 'qa'
          spawn(state, effects, 'qa', slice.repo, slice.id, slice.round, state.config.qa, now)
        } else {
          const last = slice.rounds.at(-1)
          if (last) last.verdict = event.isAdvanced ? 'dirty' : 'no-commit'
          climb(state, effects, slice, [event.isAdvanced ? 'the worktree had uncommitted changes when dev returned; commit everything the slice needs' : 'no commit landed on the slice branch'], now)
        }
      }
      break
    }

    case 'head-read': {
      const integration = state.integration[event.repo]
      if (integration?.step === 'head') {
        integration.before = event.head
        integration.step = 'agent'
        spawnMerge(state, effects, event.repo, now)
      }
      break
    }

    case 'head-failed': {
      const integration = state.integration[event.repo]
      if (integration?.step === 'head') {
        endBatch(state, event.repo, true)
        blockIntegration(state, effects, event.repo, event.reason, now)
      }
      break
    }

    case 'merge-checked': {
      const integration = state.integration[event.repo]
      if (integration?.step !== 'check') break
      if (event.problem) {
        integration.step = 'agent'
        delete integration.report
        retryMerge(state, effects, event.repo, `the merge agent's work did not check out: ${event.problem}`, now)
      } else {
        applyMerge(state, effects, event.repo, event.commits, now)
      }
      break
    }
  }

  schedule(state, now, effects)
  return { state, effects }
}

// --- agents

function agentOf(state: RunState, agentId: string): AgentRef | undefined {
  return Object.values(state.agents).find(a => a.agentId === agentId)
}

// Where an agent's rounds and retries live: its slice, the repo's integration for the merge
// agent, the repo's final QA otherwise.
const holderOf = (state: RunState, ref: Pick<AgentRef, 'role' | 'repo' | 'slice'>) =>
  ref.slice ? state.slices[ref.slice] : ref.role === 'merge' ? state.integration[ref.repo] : state.finals[ref.repo]

// What a log line or the drill-in names an agent's work by.
export const atOf = (ref: Pick<AgentRef, 'role' | 'repo' | 'slice'>) => ref.slice ?? (ref.role === 'merge' ? `merge:${ref.repo}` : `final:${ref.repo}`)

function spawn(state: RunState, effects: Effect[], role: Role, repo: string, slice: string | undefined, round: number, rung: Rung, now: number) {
  state.seq += 1
  const key = `${state.id}:${atOf({ role, repo, slice }).replace(':', '-')}:${role}:r${round}:${state.seq}`
  const ref: AgentRef = { key, role, repo, round, rung, startedAt: now, ...(slice ? { slice } : {}) }

  state.agents[key] = ref

  const record: Round = { round, role, rung, startedAt: now }
  holderOf(state, ref)?.rounds.push(record)

  effects.push({ kind: 'spawn', key, role, repo, round, rung, ...(slice ? { slice } : {}) })
}

function spawnDev(state: RunState, effects: Effect[], slice: SliceState, now: number) {
  const rung = state.config.ladders[slice.mode][slice.round - 1]
  if (!rung) {
    blockSlice(state, effects, slice, 'no rung left on the ladder', now)
    return
  }
  slice.phase = 'dev'
  spawn(state, effects, 'dev', slice.repo, slice.id, slice.round, rung, now)
}

function roundOf(state: RunState, ref: AgentRef): Round | undefined {
  const rounds = holderOf(state, ref)?.rounds
  return rounds ? [...rounds].reverse().find(r => r.role === ref.role && r.round === ref.round && r.endedAt === undefined) : undefined
}

function ended(state: RunState, effects: Effect[], ref: AgentRef, event: Extract<Event, { kind: 'ended' }>, now: number) {
  const round = roundOf(state, ref)
  const report = ref.report
  const verdict: Verdict =
    event.reason === 'lost' ? 'lost'
    : event.reason === 'refusal' ? 'refusal'
    : !report ? 'no-report'
    : report.kind === 'qa' || report.kind === 'final-qa' ? (report.pass ? 'pass' : 'fail')
    : report.kind === 'resolve' ? (report.resolved ? 'pass' : 'fail')
    : report.kind === 'merge' ? (report.baseRed || report.slices.some(s => s.outcome !== 'merged') ? 'fail' : 'pass')
    : report.committed ? 'pass' : 'no-commit'

  if (round) {
    round.endedAt = now
    round.verdict = verdict
    if (event.usage) round.usage = event.usage
    if (event.durationMs !== undefined) round.durationMs = event.durationMs
    if (report && 'summary' in report) round.summary = report.summary
    if (report?.kind === 'qa') round.defects = report.defects
    if (report?.kind === 'final-qa') round.defects = report.findings
  }

  const slice = ref.slice ? state.slices[ref.slice] : undefined
  effects.push({
    kind: 'log',
    entry: {
      run: state.id,
      at: atOf(ref),
      role: ref.role,
      mode: slice?.mode ?? null,
      round: ref.round,
      model: ref.rung.model,
      effort: ref.rung.effort,
      verdict,
      durationMs: event.durationMs ?? null,
      usage: event.usage ?? null,
      startedAt: ref.startedAt,
      endedAt: now,
    },
  })

  if (event.reason === 'lost') {
    // The session or the module that held the agent went away: run the same round again.
    respawn(state, effects, ref, now)
    return
  }

  if (event.reason === 'refusal') {
    failHard(state, effects, ref, `${ref.role} agent refused (${rungLabel(ref.rung)})`, now)
    return
  }

  if (!report) {
    failAgent(state, effects, ref, `${ref.role} agent ended without a report (${event.reason})`, now)
    return
  }

  if (report.cannotRun) {
    failAgent(state, effects, ref, `${ref.role} agent could not run: ${report.cannotRun}`, now)
    return
  }

  if (report.kind === 'merge') {
    const integration = state.integration[ref.repo]
    if (!integration || integration.step !== 'agent') return
    // The mod checks the work before it believes the report.
    integration.report = report
    integration.step = 'check'
    effects.push(checkMergeOf(state, ref.repo, report))
    return
  }

  if (slice) {
    if (report.kind === 'dev') {
      slice.dev = report
      delete slice.isFresh
      if (report.committed) {
        slice.phase = 'checking'
        effects.push({ kind: 'check-dev', slice: slice.id })
      } else {
        climb(state, effects, slice, [`round ${ref.round} dev (${rungLabel(ref.rung)}) committed nothing: ${report.summary}`], now)
      }
    } else if (report.kind === 'resolve') {
      if (report.resolved) {
        slice.phase = 'checking'
        slice.isAfterResolve = true
        effects.push({ kind: 'check-dev', slice: slice.id })
      } else if (report.notReproduced) {
        // Red only once merged, and not on the slice with the integration branch in: the merge
        // agent tries it again, which runs any red twice.
        if ((slice.resolveAttempts ?? 0) < RESOLVE_ATTEMPTS) {
          slice.isAfterResolve = false
          queueFront(state, [slice.id])
        } else {
          blockSlice(state, effects, slice, `red only after merging, and not reproduced on the slice: ${(slice.mergeFailures ?? []).join('; ') || report.summary}`, now, rungLabel(ref.rung), slice.mergeFailures)
        }
      } else {
        blockSlice(state, effects, slice, `requirements conflict with merged work: ${report.conflict || report.summary}`, now, rungLabel(ref.rung))
      }
    } else if (report.kind === 'qa' && slice.isAfterResolve) {
      const unmet = unmetCriteria(state, slice.id, report)
      if (report.pass && !unmet.length) {
        slice.isAfterResolve = false
        slice.phase = 'queued'
        state.queue.push(slice.id)
      } else {
        const defects = [...report.defects, ...unmet]
        resolveAgain(state, effects, slice, defects.length ? defects : ['QA rejected the resolved merge without listing defects'], now)
      }
    } else if (report.kind === 'qa') {
      if (report.pass) {
        slice.phase = 'queued'
        state.queue.push(slice.id)
      } else {
        climb(state, effects, slice, report.defects.length ? report.defects : ['QA rejected without listing defects: re-check every acceptance criterion'], now)
      }
    }
    return
  }

  const final = state.finals[ref.repo]
  if (!final) return

  if (report.kind === 'final-qa') {
    if (report.pass) {
      final.phase = 'pass'
      final.findings = []
    } else {
      final.findings = report.findings.length ? report.findings : ['final QA failed without findings: re-run the suite and every acceptance criterion']
      remediate(state, effects, final, now)
    }
  } else if (report.kind === 'remediate') {
    if (report.committed) {
      // A fresh judge, never the fixer, grades the fix.
      final.phase = 'judging'
      final.infraRetried = false
      spawn(state, effects, 'final-qa', final.repo, undefined, final.round, state.config.finalQa, now)
    } else {
      remediate(state, effects, final, now)
    }
  }
}

function respawn(state: RunState, effects: Effect[], ref: AgentRef, now: number) {
  spawn(state, effects, ref.role, ref.repo, ref.slice, ref.round, ref.rung, now)
}

// No result from an agent is infrastructure (or the model forgetting the report), not
// capability: one more try on the same rung, which uses up no rung, then a blocker.
function failAgent(state: RunState, effects: Effect[], ref: AgentRef, reason: string, now: number) {
  if (ref.role === 'merge') {
    retryMerge(state, effects, ref.repo, reason, now)
    return
  }
  const holder = holderOf(state, ref)
  if (!holder) return

  if (!holder.infraRetried) {
    holder.infraRetried = true
    respawn(state, effects, ref, now)
    return
  }

  failHard(state, effects, ref, `${reason}, after a retry on the same rung`, now)
}

function failHard(state: RunState, effects: Effect[], ref: AgentRef, reason: string, now: number) {
  if (ref.role === 'merge') {
    climbMerge(state, effects, ref.repo, reason, now)
    return
  }
  const slice = ref.slice ? state.slices[ref.slice] : undefined
  if (slice) {
    blockSlice(state, effects, slice, reason, now, rungLabel(ref.rung))
    slice.stoppedOnInfra = true
    return
  }
  const final = state.finals[ref.repo]
  if (final) {
    final.phase = 'blocked'
    block(state, effects, `final:${ref.repo}`, reason, now, rungLabel(ref.rung), final.findings, state.integration[ref.repo]?.path)
  }
}

// --- the ladder

function climb(state: RunState, effects: Effect[], slice: SliceState, defects: string[], now: number) {
  const ladder = state.config.ladders[slice.mode]
  slice.defects = defects

  if (slice.round >= ladder.length) {
    const top = ladder[ladder.length - 1]
    blockSlice(state, effects, slice, `circuit breaker: rejected at the top rung after ${slice.round} round(s)`, now, top ? rungLabel(top) : undefined, defects)
    return
  }

  const from = ladder[slice.round - 1]
  slice.round += 1
  const to = ladder[slice.round - 1]

  if (state.config.takeover === 'fresh' && from && to && from.model !== to.model) {
    // The new dev resets the tree to where the slice began; the mod does not touch it.
    slice.isFresh = true
    slice.defects = null
  }

  spawnDev(state, effects, slice, now)
}

// A merge conflicted: an agent merges the integration branch into the slice branch, in the
// slice's worktree, keeping both sides' acceptance criteria. Same rung as the slice's dev.
function startResolve(state: RunState, effects: Effect[], slice: SliceState, defects: string[] | null, now: number) {
  const rung = state.config.ladders[slice.mode][slice.round - 1] ?? state.config.ladders[slice.mode].at(-1)
  if (!rung) {
    blockSlice(state, effects, slice, 'no rung for the resolve', now)
    return
  }
  slice.resolveAttempts = (slice.resolveAttempts ?? 0) + 1
  slice.defects = defects
  slice.isAfterResolve = true
  slice.phase = 'resolving'
  spawn(state, effects, 'resolve', slice.repo, slice.id, slice.round, rung, now)
}

function resolveAgain(state: RunState, effects: Effect[], slice: SliceState, defects: string[], now: number) {
  if ((slice.resolveAttempts ?? 0) >= RESOLVE_ATTEMPTS) {
    slice.defects = defects
    blockSlice(state, effects, slice, `the resolved merge failed after ${slice.resolveAttempts} resolve round(s)`, now, undefined, defects)
    return
  }
  startResolve(state, effects, slice, defects, now)
}

// --- merging
//
// The merge agent takes every queued slice of a repo as one batch: it merges them into the
// integration worktree, builds and runs the suite, runs any red a second time, and on a red
// that holds finds which slice caused it. The mod reads HEAD before it starts, checks its work
// after, and decides each slice from the report. An empty batch is the baseline check.

function startBatch(state: RunState, effects: Effect[], repo: string, ids: string[]) {
  const integration = state.integration[repo]
  if (!integration) return
  integration.merging = ids
  integration.step = 'head'
  integration.round = 1
  integration.infraRetried = false
  delete integration.before
  delete integration.report
  for (const id of ids) {
    const slice = state.slices[id]
    if (slice) slice.phase = 'integrating'
  }
  effects.push({ kind: 'read-head', repo })
}

// What the report says landed and what did not, by branch, for the mod to check against git.
function checkMergeOf(state: RunState, repo: string, report: MergeReport): Effect {
  const integration = state.integration[repo]
  const batch = integration?.merging ?? []
  const isMerged = (id: string) => !report.baseRed && report.slices.find(s => s.slice === id)?.outcome === 'merged'
  const branchOf = (id: string) => state.slices[id]?.branch ?? id
  return {
    kind: 'check-merge',
    repo,
    before: integration?.before ?? '',
    merged: batch.filter(isMerged).map(branchOf),
    unmerged: batch.filter(id => !isMerged(id)).map(branchOf),
  }
}

function spawnMerge(state: RunState, effects: Effect[], repo: string, now: number) {
  const integration = state.integration[repo]
  const rung = state.config.merge[(integration?.round ?? 1) - 1]
  if (!integration || !rung) {
    endBatch(state, repo, true)
    blockIntegration(state, effects, repo, 'no rung left on the merge ladder', now)
    return
  }
  spawn(state, effects, 'merge', repo, undefined, integration.round, rung, now)
}

// The merge agent left no usable result: once more on the same rung, then up the ladder.
function retryMerge(state: RunState, effects: Effect[], repo: string, reason: string, now: number) {
  const integration = state.integration[repo]
  if (!integration) return
  if (!integration.infraRetried) {
    integration.infraRetried = true
    spawnMerge(state, effects, repo, now)
    return
  }
  climbMerge(state, effects, repo, `${reason}, after a retry on the same rung`, now)
}

function climbMerge(state: RunState, effects: Effect[], repo: string, reason: string, now: number) {
  const integration = state.integration[repo]
  if (!integration) return
  if (integration.round < state.config.merge.length) {
    integration.round += 1
    integration.infraRetried = false
    spawnMerge(state, effects, repo, now)
    return
  }
  const top = state.config.merge.at(-1)
  endBatch(state, repo, true)
  blockIntegration(state, effects, repo, `${reason}; the merge ladder is spent`, now, top ? rungLabel(top) : undefined)
}

// The batch is over. Slices it did not decide go back to the front of the queue.
function endBatch(state: RunState, repo: string, requeue: boolean) {
  const integration = state.integration[repo]
  if (!integration) return
  const batch = integration.merging ?? []
  integration.merging = null
  integration.round = 1
  integration.infraRetried = false
  delete integration.step
  delete integration.before
  delete integration.report
  if (requeue) queueFront(state, batch)
}

function queueFront(state: RunState, ids: string[]) {
  const back = ids.filter(id => state.slices[id])
  for (const id of back) (state.slices[id] as SliceState).phase = 'queued'
  state.queue = [...back, ...state.queue.filter(id => !back.includes(id))]
}

function applyMerge(state: RunState, effects: Effect[], repo: string, commits: Record<string, string>, now: number) {
  const integration = state.integration[repo]
  const report = integration?.report
  if (!integration || !report) return
  const batch = integration.merging ?? []
  integration.flaky = [...new Set([...integration.flaky, ...report.flaky])]
  endBatch(state, repo, false)

  if (report.baseRed) {
    // Nothing in the batch can be judged on a red base, and nothing new should start on it.
    integration.isReady = false
    queueFront(state, batch)
    const what = batch.length ? 'without this batch' : 'before any merge'
    blockIntegration(state, effects, repo, `${integration.branch} fails ${what}, run twice: ${report.failing.join('; ') || report.summary}`, now, undefined, report.failing)
    return
  }

  if (!batch.length) {
    integration.isReady = true
    return
  }

  const requeue: string[] = []
  for (const id of batch) {
    const slice = state.slices[id]
    if (!slice) continue
    const merge = report.slices.find(s => s.slice === id)
    const outcome = merge?.outcome ?? 'not-tried'
    if (outcome === 'merged') {
      markMerged(state, effects, slice, commits[slice.branch] ?? '', now)
    } else if (outcome === 'conflict') {
      slice.conflicts = merge?.conflicts ?? []
      delete slice.mergeFailures
      resolveOrBlock(state, effects, slice, `merge conflict in ${slice.conflicts.join(', ') || 'unnamed files'}`, now)
    } else if (outcome === 'red') {
      slice.conflicts = []
      slice.mergeFailures = merge?.failing?.length ? merge.failing : ['the build or suite went red with this slice merged; the merge agent named no test']
      resolveOrBlock(state, effects, slice, `red after merging, twice: ${slice.mergeFailures.join('; ')}`, now)
    } else {
      requeue.push(id)
    }
  }
  queueFront(state, requeue)
}

function markMerged(state: RunState, effects: Effect[], slice: SliceState, commit: string, now: number) {
  slice.phase = 'merged'
  slice.commit = commit
  slice.mergedAt = now
  delete slice.conflicts
  delete slice.mergeFailures
  state.handoff[slice.id] = handoffOf(state, slice)
  effects.push({ kind: 'remove-slice', slice: slice.id })
  if (state.plan.source.kind === 'github') effects.push({ kind: 'close-issue', slice: slice.id })
}

function resolveOrBlock(state: RunState, effects: Effect[], slice: SliceState, what: string, now: number) {
  if ((slice.resolveAttempts ?? 0) < RESOLVE_ATTEMPTS) {
    startResolve(state, effects, slice, null, now)
    return
  }
  blockSlice(state, effects, slice, `${what}, after ${slice.resolveAttempts ?? 0} resolve round(s)`, now, undefined, slice.mergeFailures)
}

// The integration branch needs the person. Slices keep their place; the merges wait for a retry.
function blockIntegration(state: RunState, effects: Effect[], repo: string, reason: string, now: number, rung?: string, defects?: string[]) {
  state.blockers = state.blockers.filter(b => b.at !== `integration:${repo}`)
  block(state, effects, `integration:${repo}`, reason, now, rung, defects, state.integration[repo]?.path)
}

function remediate(state: RunState, effects: Effect[], final: FinalState, now: number) {
  const ladder = state.config.remediation

  if (final.round >= ladder.length) {
    final.phase = 'blocked'
    const top = ladder[ladder.length - 1]
    block(state, effects, `final:${final.repo}`, `final QA findings survived ${final.round} remediation round(s)`, now, top ? rungLabel(top) : undefined, final.findings, state.integration[final.repo]?.path)
    return
  }

  final.round += 1
  final.phase = 'fixing'
  final.infraRetried = false
  const rung = ladder[final.round - 1] as Rung
  spawn(state, effects, 'remediate', final.repo, undefined, final.round, rung, now)
}

// --- blockers

function block(state: RunState, effects: Effect[], at: string, reason: string, now: number, rung?: string, defects?: string[], worktree?: string) {
  const blocker: Blocker = { at, reason, time: now, ...(rung ? { rung } : {}), ...(defects?.length ? { defects } : {}), ...(worktree ? { worktree } : {}) }
  state.blockers.push(blocker)
  effects.push({ kind: 'blocker', blocker })
}

function blockSlice(state: RunState, effects: Effect[], slice: SliceState, reason: string, now: number, rung?: string, defects?: string[]) {
  state.queue = state.queue.filter(id => id !== slice.id)
  slice.stoppedIn = slice.phase
  slice.stoppedOnInfra = false
  slice.phase = 'blocked'
  slice.blocker = reason
  block(state, effects, slice.id, reason, now, rung, defects ?? slice.defects ?? undefined, slice.worktree)

  // Everything downstream stops; independent chains keep going.
  const stopped = new Set([slice.id])
  let grew = true
  while (grew) {
    grew = false
    for (const other of Object.values(state.slices)) {
      if (!stopped.has(other.id) && other.phase === 'waiting' && depsOf(state, other.id).some(d => stopped.has(d))) {
        other.phase = 'halted'
        other.blocker = `upstream ${slice.id} is blocked`
        stopped.add(other.id)
        grew = true
      }
    }
  }
}

// --- answering a blocker

function retry(state: RunState, effects: Effect[], at: string, answer: string, now: number) {
  if (at.startsWith('integration:')) {
    const repo = at.slice(12)
    const integration = state.integration[repo]
    if (!integration || !state.blockers.some(b => b.at === at)) return
    state.blockers = state.blockers.filter(b => b.at !== at)
    // The integration worktree is made ready again, and its baseline checked, before anything merges.
    integration.answer = answer
    for (const slice of Object.values(state.slices)) {
      if (slice.repo === repo && slice.phase === 'halted' && slice.blocker?.startsWith('integration branch')) {
        slice.phase = 'waiting'
        delete slice.blocker
      }
    }
    effects.push({ kind: 'create-integration', repo })
    return
  }

  if (at.startsWith('final:')) {
    const final = state.finals[at.slice(6)]
    if (!final || final.phase !== 'blocked') return
    // The remediation ladder starts over, on the strength of the answer.
    final.answer = answer
    final.round = 0
    final.infraRetried = false
    remediate(state, effects, final, now)
    return
  }

  const slice = state.slices[at]
  if (!slice || slice.phase !== 'blocked') return

  // The slice goes again on the rung it stopped on: what changed is the answer, not the rung.
  slice.answer = answer
  slice.infraRetried = false
  delete slice.blocker
  state.blockers = state.blockers.filter(b => b.at !== at)

  const released = new Set([slice.id])
  let grew = true
  while (grew) {
    grew = false
    for (const other of Object.values(state.slices)) {
      if (!released.has(other.id) && other.phase === 'halted' && depsOf(state, other.id).some(d => released.has(d))) {
        other.phase = 'waiting'
        delete other.blocker
        released.add(other.id)
        grew = true
      }
    }
  }

  if (slice.stoppedIn === 'resolving' || (slice.isAfterResolve && (slice.stoppedIn === 'checking' || slice.stoppedIn === 'qa'))) {
    // The resolve stopped (a requirements conflict, or its rounds ran out): it goes again with the answer.
    slice.resolveAttempts = 0
    startResolve(state, effects, slice, slice.defects, now)
  } else if (slice.stoppedIn === 'integrating') {
    // The work passed QA; only the merge or its verify failed, so it queues again.
    slice.resolveAttempts = 0
    slice.phase = 'queued'
    state.queue.push(slice.id)
  } else if (slice.stoppedOnInfra && slice.stoppedIn === 'qa' && slice.worktree) {
    // QA never ran: the dev's commit stands, so QA goes again, not dev.
    slice.phase = 'qa'
    spawn(state, effects, 'qa', slice.repo, slice.id, slice.round, state.config.qa, now)
  } else if (slice.worktree) {
    spawnDev(state, effects, slice, now)
  } else {
    slice.phase = 'waiting'
  }
}

// The person dropped a slice: it leaves the run unbuilt, and whatever depended on it stays
// halted until they drop or retry that too.
function drop(state: RunState, effects: Effect[], id: string, now: number) {
  const slice = state.slices[id]
  if (!slice || ['merged', 'landed', 'integrating', 'descoped'].includes(slice.phase)) return
  state.queue = state.queue.filter(q => q !== id)
  state.blockers = state.blockers.filter(b => b.at !== id)
  for (const ref of Object.values(state.agents)) if (ref.slice === id) delete state.agents[ref.key]
  slice.phase = 'descoped'
  slice.isDropped = true
  slice.blocker = 'dropped by the person'
  const stopped = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const other of Object.values(state.slices)) {
      if (!stopped.has(other.id) && ['waiting', 'halted'].includes(other.phase) && depsOf(state, other.id).some(d => stopped.has(d))) {
        other.phase = 'halted'
        other.blocker = `upstream ${id} was dropped`
        stopped.add(other.id)
        grew = true
      }
    }
  }
  if (state.status === 'running') schedule(state, now, effects)
}

// After a reload: the effects that were running in the module that went away. Each one is
// safe to issue again.
export function inFlight(state: RunState): Effect[] {
  if (state.status !== 'running') return []
  const effects: Effect[] = []

  for (const [repo, integration] of Object.entries(state.integration)) {
    const failed = state.blockers.some(b => b.at === `integration:${repo}`)
    if (!integration.path && !failed) effects.push({ kind: 'create-integration', repo })
    // The merge agent itself is an agent: a reload finds it lost and runs it again.
    if (integration.step === 'head') effects.push({ kind: 'read-head', repo })
    if (integration.step === 'check' && integration.report) effects.push(checkMergeOf(state, repo, integration.report))
  }

  for (const slice of Object.values(state.slices)) {
    if (slice.phase === 'starting') effects.push({ kind: 'create-slice', slice: slice.id })
    if (slice.phase === 'checking') effects.push({ kind: 'check-dev', slice: slice.id })
  }

  return effects
}

// --- scheduling

function depsOf(state: RunState, id: string): string[] {
  return state.plan.slices.find(s => s.id === id)?.deps ?? []
}

function handoffOf(state: RunState, slice: SliceState): string {
  const title = state.plan.slices.find(s => s.id === slice.id)?.title ?? slice.id
  const dev = slice.dev
  return [
    `${slice.id} (${title}) merged as ${slice.commit ?? 'unknown commit'}: ${dev?.summary ?? ''}`,
    dev?.newApis ? `New: ${dev.newApis}` : '',
    dev?.todos ? `Deferred: ${dev.todos}` : '',
  ].filter(Boolean).join(' ')
}

// Slices that unblock the most downstream work go first.
function downstream(state: RunState, id: string): number {
  return state.plan.slices.filter(s => s.deps.includes(id)).length
}

function schedule(state: RunState, now: number, effects: Effect[]) {
  if (state.status !== 'running') return

  const slices = state.order.map(id => state.slices[id]).filter((s): s is SliceState => !!s)
  let active = slices.filter(s => ACTIVE.includes(s.phase)).length

  const ready = slices
    .filter(s => s.phase === 'waiting' && state.integration[s.repo]?.isReady)
    .filter(s => depsOf(state, s.id).every(d => DONE.includes(state.slices[d]?.phase ?? 'waiting')))
    .sort((a, b) => downstream(state, b.id) - downstream(state, a.id))

  for (const slice of ready) {
    if (active >= state.config.concurrency) break
    slice.phase = 'starting'
    effects.push({ kind: 'create-slice', slice: slice.id })
    active += 1
  }

  // Every queued slice of a repo goes to its merge agent as one batch, one batch at a time.
  for (const [repo, integration] of Object.entries(state.integration)) {
    if (!integration.isReady || integration.merging || state.blockers.some(b => b.at === `integration:${repo}`)) continue
    const batch = state.queue.filter(id => state.slices[id]?.repo === repo)
    if (!batch.length) continue
    state.queue = state.queue.filter(id => !batch.includes(id))
    startBatch(state, effects, repo, batch)
  }

  if (slices.some(s => UNFINISHED.includes(s.phase))) return
  if (Object.values(state.integration).some(i => i.merging)) return

  for (const final of Object.values(state.finals)) {
    // Skipped is decided again: a retry can reopen a run that ended with nothing merged.
    if (final.phase !== 'idle' && final.phase !== 'skipped') continue
    const repoSlices = slices.filter(s => s.repo === final.repo)
    if (!repoSlices.some(s => DONE.includes(s.phase)) || !state.integration[final.repo]?.isReady) {
      final.phase = 'skipped'
      continue
    }
    final.phase = 'judging'
    spawn(state, effects, 'final-qa', final.repo, undefined, 0, state.config.finalQa, now)
  }

  if (Object.values(state.finals).every(f => f.phase === 'pass' || f.phase === 'blocked' || f.phase === 'skipped')) {
    state.status = 'done'
    state.endedAt = now
    effects.push({ kind: 'finished' })
  }
}

// --- reading the state, for the pane, the status line and the report

export type Totals = { slices: number; merged: number; blocked: number; running: number; tokens: number; durationMs: number }

export function totals(state: RunState, now: number): Totals {
  const slices = Object.values(state.slices)
  const rounds = [...slices.flatMap(s => s.rounds), ...Object.values(state.finals).flatMap(f => f.rounds)]
  return {
    slices: slices.length,
    merged: slices.filter(s => DONE.includes(s.phase)).length,
    blocked: slices.filter(s => s.phase === 'blocked').length + Object.values(state.finals).filter(f => f.phase === 'blocked').length,
    running: Object.keys(state.agents).length,
    tokens: rounds.reduce((sum, r) => sum + (r.usage ? r.usage.input + r.usage.output + r.usage.cacheRead + r.usage.cacheWrite : 0), 0),
    durationMs: (state.endedAt ?? now) - state.startedAt,
  }
}
