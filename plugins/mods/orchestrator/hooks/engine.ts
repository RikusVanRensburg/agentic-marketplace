// The run as a pure state machine: `start` and `step` take the state and one event and return
// the next state and the effects to carry out. Nothing here touches git, agents or the
// tracker; register.tsx does, and feeds each outcome back in as an event. The state is what
// `$.store` keeps, so a reload or a new session picks the run up where it stood.

import type { Config, Mode, Rung } from './config'
import { rungLabel } from './config'
import type { Closed, Plan } from './plan'
import { integrationBranchOf, sliceBranchOf } from './plan'

export type Role = 'dev' | 'qa' | 'final-qa' | 'remediate' | 'resolve'

export type Phase =
  | 'waiting' // deps not merged yet
  | 'starting' // worktree being created
  | 'dev'
  | 'checking' // dev reported a commit; the mod checks the tree
  | 'qa'
  | 'queued' // QA passed, waiting for integration
  | 'integrating'
  | 'resolving' // a merge conflicted; an agent merges the integration branch into the slice
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
// slices' requirements cannot both hold.
export type ResolveReport = { kind: 'resolve'; resolved: boolean; summary: string; conflict?: string }
// cannotRun: the agent could not attempt the work at all (its worktree missing, a tool it
// needs refused). That is infrastructure, not a verdict: no rung is spent on it.
export type Report = (DevReport | QaReport | FinalReport | FixReport | ResolveReport) & { cannotRun?: string }

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
  resolveAttempts?: number
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

export type IntegrationState = { branch: string; path?: string; isReady: boolean }

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
  integrating: string | null
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
  | { kind: 'reset-slice'; slice: string }
  | { kind: 'check-dev'; slice: string }
  | { kind: 'clean-for-qa'; slice: string }
  | { kind: 'spawn'; key: string; role: Role; repo: string; slice?: string; round: number; rung: Rung }
  | { kind: 'integrate'; slice: string }
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
  | { kind: 'integrated'; slice: string; isMerged: true; commit: string }
  | { kind: 'integrated'; slice: string; isMerged: false; conflicts?: string[]; failure?: string }
  | { kind: 'abort' }
  // The person answered a blocker: `at` is a slice id or `final:<repo>`.
  | { kind: 'retry'; at: string; answer: string }
  // The person took a slice out of the run; its dependents stay halted.
  | { kind: 'drop'; slice: string }

export type Step = { state: RunState; effects: Effect[] }

// Resolve rounds a conflict gets before it reaches the person.
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
    integration: Object.fromEntries(Object.keys(plan.repos).map(repo => [repo, { branch, isReady: false }])),
    slices: {},
    order: plan.slices.map(s => s.id),
    queue: [],
    integrating: null,
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
      const integration = state.integration[event.repo]
      if (integration) {
        integration.path = event.path
        integration.isReady = true
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
          effects.push({ kind: 'clean-for-qa', slice: slice.id })
          spawn(state, effects, 'qa', slice.repo, slice.id, slice.round, state.config.qa, now)
        } else {
          resolveAgain(state, effects, slice, ['the resolve left the worktree dirty or committed nothing; commit the resolved merge'], now)
        }
      } else if (slice && slice.phase === 'checking') {
        if (event.isClean && event.isAdvanced) {
          slice.phase = 'qa'
          effects.push({ kind: 'clean-for-qa', slice: slice.id })
          spawn(state, effects, 'qa', slice.repo, slice.id, slice.round, state.config.qa, now)
        } else {
          const last = slice.rounds.at(-1)
          if (last) last.verdict = event.isAdvanced ? 'dirty' : 'no-commit'
          climb(state, effects, slice, [event.isAdvanced ? 'the worktree had uncommitted changes when dev returned; commit everything the slice needs' : 'no commit landed on the slice branch'], now)
        }
      }
      break
    }

    case 'integrated': {
      const slice = state.slices[event.slice]
      if (slice && slice.phase === 'integrating') {
        state.integrating = null
        if (event.isMerged) {
          slice.phase = 'merged'
          slice.commit = event.commit
          slice.mergedAt = now
          state.handoff[slice.id] = handoffOf(state, slice)
          effects.push({ kind: 'remove-slice', slice: slice.id })
          if (state.plan.source.kind === 'github') effects.push({ kind: 'close-issue', slice: slice.id })
        } else if (event.conflicts?.length && (slice.resolveAttempts ?? 0) < RESOLVE_ATTEMPTS) {
          slice.conflicts = event.conflicts
          startResolve(state, effects, slice, null, now)
        } else {
          const reason = event.conflicts?.length
            ? `merge conflict in ${event.conflicts.join(', ')} survived ${slice.resolveAttempts ?? 0} resolve round(s); merge aborted`
            : `verify failed after merge, merge reset: ${event.failure ?? 'no detail'}`
          blockSlice(state, effects, slice, reason, now)
        }
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

function spawn(state: RunState, effects: Effect[], role: Role, repo: string, slice: string | undefined, round: number, rung: Rung, now: number) {
  state.seq += 1
  const key = `${state.id}:${slice ?? `final-${repo}`}:${role}:r${round}:${state.seq}`
  const ref: AgentRef = { key, role, repo, round, rung, startedAt: now, ...(slice ? { slice } : {}) }

  state.agents[key] = ref

  const record: Round = { round, role, rung, startedAt: now }
  if (slice) state.slices[slice]?.rounds.push(record)
  else state.finals[repo]?.rounds.push(record)

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
  const rounds = ref.slice ? state.slices[ref.slice]?.rounds : state.finals[ref.repo]?.rounds
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
      at: ref.slice ?? `final:${ref.repo}`,
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

  if (slice) {
    if (report.kind === 'dev') {
      slice.dev = report
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
  const holder = ref.slice ? state.slices[ref.slice] : state.finals[ref.repo]
  if (!holder) return

  if (!holder.infraRetried) {
    holder.infraRetried = true
    respawn(state, effects, ref, now)
    return
  }

  failHard(state, effects, ref, `${reason}, after a retry on the same rung`, now)
}

function failHard(state: RunState, effects: Effect[], ref: AgentRef, reason: string, now: number) {
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
    effects.push({ kind: 'reset-slice', slice: slice.id })
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
  if (state.integrating === slice.id) state.integrating = null
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
    if (!state.blockers.some(b => b.at === at)) return
    state.blockers = state.blockers.filter(b => b.at !== at)
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
    if (!integration.isReady && !failed) effects.push({ kind: 'create-integration', repo })
  }

  for (const slice of Object.values(state.slices)) {
    if (slice.phase === 'starting') effects.push({ kind: 'create-slice', slice: slice.id })
    if (slice.phase === 'checking') effects.push({ kind: 'check-dev', slice: slice.id })
    if (slice.phase === 'integrating') effects.push({ kind: 'integrate', slice: slice.id })
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

  if (!state.integrating && state.queue.length) {
    const next = state.queue.shift() as string
    const slice = state.slices[next]
    if (slice) {
      slice.phase = 'integrating'
      state.integrating = next
      effects.push({ kind: 'integrate', slice: next })
    }
  }

  if (slices.some(s => UNFINISHED.includes(s.phase))) return

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
