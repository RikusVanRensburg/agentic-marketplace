// The run as a pure state machine: `start` and `step` take the state and one event and return
// the next state and the effects to carry out. Nothing here touches git, agents or the
// tracker; register.tsx does, and feeds each outcome back in as an event. The state is what
// `$.store` keeps, so a reload or a new session picks the run up where it stood.

import type { Config, Mode, Rung } from './config'
import { rungLabel } from './config'
import type { Closed, Plan } from './plan'
import { integrationBranchOf, sliceBranchOf } from './plan'

export type Role = 'dev' | 'qa' | 'final-qa' | 'remediate'

export type Phase =
  | 'waiting' // deps not merged yet
  | 'starting' // worktree being created
  | 'dev'
  | 'checking' // dev reported a commit; the mod checks the tree
  | 'qa'
  | 'queued' // QA passed, waiting for integration
  | 'integrating'
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
export type QaReport = { kind: 'qa'; pass: boolean; defects: string[] }
export type FinalReport = { kind: 'final-qa'; pass: boolean; findings: string[] }
export type FixReport = { kind: 'remediate'; committed: boolean; summary: string }
export type Report = DevReport | QaReport | FinalReport | FixReport

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

export type Step = { state: RunState; effects: Effect[] }

const ACTIVE: readonly Phase[] = ['starting', 'dev', 'checking', 'qa']
const UNFINISHED: readonly Phase[] = ['waiting', 'starting', 'dev', 'checking', 'qa', 'queued', 'integrating']
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

  if (state.status !== 'running') {
    return { state, effects }
  }

  switch (event.kind) {
    case 'abort':
      state.status = 'aborted'
      state.endedAt = now
      return { state, effects }

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
      if (slice && slice.phase === 'checking') {
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
          state.handoff[slice.id] = handoffOf(state, slice)
          effects.push({ kind: 'remove-slice', slice: slice.id })
          if (state.plan.source.kind === 'github') effects.push({ kind: 'close-issue', slice: slice.id })
        } else {
          const reason = event.conflicts?.length
            ? `merge conflict in ${event.conflicts.join(', ')}; merge aborted`
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

  if (slice) {
    if (report.kind === 'dev') {
      slice.dev = report
      if (report.committed) {
        slice.phase = 'checking'
        effects.push({ kind: 'check-dev', slice: slice.id })
      } else {
        climb(state, effects, slice, [`round ${ref.round} dev (${rungLabel(ref.rung)}) committed nothing: ${report.summary}`], now)
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
    if (final.phase !== 'idle') continue
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
