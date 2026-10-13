import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import type { RunView, SliceRow } from '../types'

// The pane draws a run's slices by group, a blocker with its worktree and the way to answer
// it, and a row's history when pressed. The view comes from a stubbed state read.

const row = (over: Partial<SliceRow>): SliceRow => ({
  id: '0', title: 'x', repo: 'timebase', mode: 'sonnet-first', phase: 'waiting', group: 'waiting', stage: 0, round: 1, rungs: 3,
  role: null, rung: null, runningMs: null, tokens: 0, waitingOn: [], blocker: null, defects: [], worktree: null,
  branch: 'feat/RVR/orchestration/payments/0-x', commit: null, history: [], ...over,
})

const VIEW: RunView = {
  id: 'payments-202610131500',
  title: 'Payments',
  status: 'running',
  branches: ['timebase feat/RVR/payments'],
  merged: 1,
  slices: 4,
  blocked: 1,
  agents: 1,
  tokens: 1_200_000,
  durationMs: 18 * 60_000,
  rows: [
    row({ id: '107', title: 'Core DTO', phase: 'merged', group: 'done', stage: 4, commit: 'a1b2c3d4e5' }),
    row({ id: '108', title: 'Endpoint', phase: 'dev', group: 'build', stage: 1, round: 2, role: 'dev', rung: 'sonnet/xhigh', runningMs: 180_000, tokens: 41_000, history: ['r1 dev sonnet/high pass', 'r1 qa opus/high fail: 2 defects', 'r2 dev sonnet/xhigh running'] }),
    row({ id: '112', title: 'Refund ledger', phase: 'blocked', group: 'blocked', round: 3, blocker: 'circuit breaker: rejected at the top rung', defects: ['Ledger.cs:40 - rounding - expected banker rounding'], worktree: 'D:/r/feat/RVR/orchestration/payments/112-refund-ledger' }),
    row({ id: '110', title: 'UI form', waitingOn: ['108'] }),
  ],
  finals: [{ repo: 'timebase', phase: 'idle', round: 0, findings: [], history: [] }],
  blockers: [{ at: '112', reason: 'circuit breaker' }],
}

function stub(on: On) {
  on('state.get', ($, e, next) => {
    const ref = e as unknown as { plugin: string; key: string }
    return ref.plugin === 'orchestrator' && ref.key === 'view' ? { value: { value: VIEW, version: 1 } } : next(e)
  })
}

const pane = (surface: 'terminal' | 'desktop') =>
  ({
    plugin: 'orchestrator',
    surface,
    component: 'Pane',
    requestId: 'orchestrator-run',
    viewport: { columns: 90, rows: 40 },
    props: { bodyColumns: 90 },
  }) as never

test('the pane groups slices and shows the blocker with its worktree and answer', async ($, on) => {
  stub(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    expect(await ui.find({ type: 'Text', text: /Payments · running/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Blocked · 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /worktree kept: D:\/r\/feat\/RVR\/orchestration\/payments\/112-refund-ledger/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /orchestrator retry 112/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /after 108/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /Merged · 1/ })).toBeDefined()
    await ui.unmount()
  }
})

test('pressing a slice opens its round history and branch', async ($, on) => {
  stub(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    expect(await ui.find({ type: 'Text', text: /r1 qa opus\/high fail: 2 defects/ })).toBeUndefined()
    await ui.press({ key: 'row-108' })
    expect(await ui.find({ type: 'Text', text: /r1 qa opus\/high fail: 2 defects/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /branch feat\/RVR\/orchestration/ })).toBeDefined()
    await ui.press({ key: 'row-108' })
    await ui.unmount()
  }
})
