// What the pane and the band draw, derived from the run: plain data, so drawing stays dumb
// and the layout can be tested without a surface.

import type { RunView, SliceRow, FinalRow, Group } from '../types'
import { rungLabel } from './config'
import type { AgentRef, Phase, Round, RunState, SliceState } from './engine'
import { totals } from './engine'

const GROUP: Record<Phase, Group> = {
  waiting: 'waiting',
  starting: 'build',
  dev: 'build',
  checking: 'build',
  qa: 'build',
  queued: 'integrate',
  integrating: 'integrate',
  merged: 'done',
  landed: 'done',
  descoped: 'done',
  blocked: 'blocked',
  halted: 'waiting',
}

// How far along the slice's own pipeline it is: dev, QA, integration, merged.
const STAGE: Record<Phase, number> = {
  waiting: 0, halted: 0, starting: 0, dev: 1, checking: 1, qa: 2, queued: 3, integrating: 3, merged: 4, landed: 4, descoped: 4, blocked: 0,
}

// An agent's name in the background task list and the pane: `orch <slice> <role> r<n> #<seq>`.
export const taskNameOf = (ref: Pick<AgentRef, 'key' | 'slice' | 'repo' | 'role' | 'round'>) =>
  `orch ${ref.slice ?? `final ${ref.repo}`} ${ref.role} r${ref.round} #${ref.key.split(':').pop()}`

const liveAgent = (state: RunState, slice: string | undefined, repo: string) =>
  Object.values(state.agents).find(a => (slice ? a.slice === slice : !a.slice && a.repo === repo))

const tokensOf = (rounds: Round[]) => rounds.reduce((sum, r) => sum + (r.usage ? r.usage.input + r.usage.output + r.usage.cacheRead + r.usage.cacheWrite : 0), 0)

function historyOf(rounds: Round[]): string[] {
  return rounds.map(r => {
    const verdict = r.verdict === undefined ? 'running' : r.verdict
    const extra = r.defects?.length ? `: ${r.defects.length} defect${r.defects.length === 1 ? '' : 's'}` : ''
    return `r${r.round} ${r.role} ${rungLabel(r.rung)} ${verdict}${extra}`
  })
}

function rowOf(state: RunState, slice: SliceState, now: number): SliceRow {
  const plan = state.plan.slices.find(s => s.id === slice.id)
  const ladder = state.config.ladders[slice.mode]
  const live = [...slice.rounds].reverse().find(r => r.endedAt === undefined)
  const last = slice.rounds.at(-1)
  const deps = plan?.deps ?? []

  return {
    id: slice.id,
    title: plan?.title ?? slice.id,
    repo: slice.repo,
    mode: slice.mode,
    phase: slice.phase,
    group: GROUP[slice.phase],
    stage: STAGE[slice.phase],
    round: slice.round,
    rungs: ladder.length,
    role: live?.role ?? last?.role ?? null,
    rung: live ? rungLabel(live.rung) : last ? rungLabel(last.rung) : null,
    runningMs: live ? Math.max(0, now - live.startedAt) : null,
    tokens: tokensOf(slice.rounds),
    waitingOn: slice.phase === 'waiting' ? deps.filter(d => !['merged', 'landed'].includes(state.slices[d]?.phase ?? '')) : [],
    blocker: slice.blocker ?? null,
    defects: slice.phase === 'blocked' ? slice.defects ?? [] : [],
    worktree: slice.worktree ?? null,
    branch: slice.branch,
    commit: slice.commit ?? null,
    history: historyOf(slice.rounds),
    ...agentFields(state, slice.id, slice.repo),
  }
}

function agentFields(state: RunState, slice: string | undefined, repo: string) {
  const ref = liveAgent(state, slice, repo)
  return { agentId: ref?.agentId ?? null, task: ref ? taskNameOf(ref) : null }
}

export function viewOf(state: RunState, now: number): RunView {
  const t = totals(state, now)
  const finals: FinalRow[] = Object.values(state.finals).map(f => ({
    repo: f.repo,
    phase: f.phase,
    round: f.round,
    findings: f.findings,
    history: historyOf(f.rounds),
    ...agentFields(state, undefined, f.repo),
  }))

  return {
    id: state.id,
    title: state.plan.title,
    status: state.status,
    branches: Object.entries(state.integration).map(([repo, i]) => `${repo} ${i.branch}`),
    merged: t.merged,
    slices: t.slices,
    blocked: t.blocked,
    agents: t.running,
    tokens: t.tokens,
    durationMs: t.durationMs,
    rows: state.order.map(id => state.slices[id]).filter((s): s is SliceState => !!s).map(s => rowOf(state, s, now)),
    finals,
    blockers: state.blockers.map(b => ({ at: b.at, reason: b.reason })),
  }
}

export const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

export function fmtTime(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

export const bar = (filled: number, width: number) => '█'.repeat(Math.max(0, Math.min(width, filled))) + '░'.repeat(Math.max(0, width - Math.max(0, filled)))

export const GLYPH: Record<Group | 'halted', string> = { build: '●', integrate: '◔', done: '✓', blocked: '✗', waiting: '◷', halted: '◌' }
