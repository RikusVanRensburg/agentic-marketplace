import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import type { Activity, RunView, SliceRow } from '../types'

// The pane: header tiles, then Needs you, In progress, Up next, Merged and Final QA, and a
// drill-in per slice. The view and the activity come from stubbed state reads.

const row = (over: Partial<SliceRow>): SliceRow => ({
  id: '0', title: 'x', repo: 'timebase', mode: 'sonnet-first', phase: 'waiting', group: 'waiting', stage: 0, round: 1, rungs: 3,
  role: null, rung: null, runningMs: null, tokens: 0, waitingOn: [], blocker: null, defects: [], worktree: null,
  branch: 'feat/RVR/orchestration/payments/0-x', commit: null, history: [], agentId: null, task: null, ...over,
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
    row({
      id: '108', title: 'Endpoint', phase: 'dev', group: 'build', stage: 1, round: 2, role: 'dev', rung: 'sonnet/xhigh', runningMs: 180_000, tokens: 41_000,
      worktree: 'D:/r/feat/RVR/orchestration/payments/108-endpoint', agentId: 'agent-108', task: 'orch 108 dev r2 #7',
      history: ['r1 dev sonnet/high pass', 'r1 qa opus/high fail: 2 defects', 'r2 dev sonnet/xhigh running'],
    }),
    row({ id: '112', title: 'Refund ledger', phase: 'blocked', group: 'blocked', round: 3, rung: 'opus/high', blocker: 'circuit breaker: rejected at the top rung', defects: ['Ledger.cs:40 - rounding - expected banker rounding'], worktree: 'D:/r/feat/RVR/orchestration/payments/112-refund-ledger' }),
    row({ id: '110', title: 'UI form', waitingOn: ['108'] }),
  ],
  finals: [{ repo: 'timebase', phase: 'idle', round: 0, findings: [], history: [], agentId: null, task: null }],
  blockers: [{ at: '112', reason: 'circuit breaker' }],
}

const ACTIVITY: Record<string, Activity> = {
  '108': { agentId: 'agent-108', task: 'orch 108 dev r2 #7', lines: [{ at: Date.now() - 4000, text: 'Edit src/Endpoint.cs' }, { at: Date.now() - 1000, text: 'Bash dotnet test' }] },
}

function stub(on: On) {
  on('state.get', ($, e, next) => {
    const ref = e as unknown as { plugin: string; key: string }
    if (ref.plugin !== 'orchestrator') return next(e)
    if (ref.key === 'view') return { value: { value: VIEW, version: 1 } }
    if (ref.key === 'activity') return { value: { value: ACTIVITY, version: 1 } }
    return next(e)
  })
  on('session.messages', () => ({ value: [{ role: 'assistant', text: 'Running the suite now that the route is in.', toolUses: [] }] }))
}

const pane = (surface: 'terminal' | 'desktop') =>
  ({ plugin: 'orchestrator', surface, component: 'Pane', requestId: 'orchestrator-run', viewport: { columns: 90, rows: 60 }, props: { bodyColumns: 90 } }) as never

// Everything drawn, text and SVG sources alike, as one string to search.
const drawnText = async (ui: { drawn: () => Promise<unknown> }) => JSON.stringify(await ui.drawn())

test('the pane shows the sections in order, the blocker with its answer, and what waits on what', async ($, on) => {
  stub(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    const all = await drawnText(ui)
    const order = ['Payments', 'Needs you · 1', 'In progress · 1', 'Up next · 1', 'Merged · 1', 'Final QA'].map(s => all.indexOf(s))
    expect({ surface, order, missing: order.some(i => i < 0) }).toEqual({ surface, order: [...order].sort((a, b) => a - b), missing: false })
    expect(all).toContain('/orchestrator retry 112')
    expect(all).toContain('after 108')
    expect(all).toContain('sonnet/xhigh')
    await ui.unmount()
  }
})

test('details opens the drill-in: recent actions, the latest message, the worktree and history', async ($, on) => {
  stub(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    expect(await drawnText(ui)).not.toContain('Bash dotnet test')
    await ui.press({ key: 'row-108' })
    const all = await drawnText(ui)
    expect(all).toContain('orch 108 dev r2 #7')
    expect(all).toContain('Bash dotnet test')
    expect(all).toContain('Running the suite now that the route is in.')
    expect(all).toContain('worktree D:/r/feat/RVR/orchestration/payments/108-endpoint')
    expect(all).toContain('r1 qa opus/high fail: 2 defects')
    await ui.press({ key: 'row-108' })
    await ui.unmount()
  }
})

const band = (surface: 'terminal' | 'desktop') =>
  ({
    plugin: 'orchestrator',
    surface,
    component: 'AbovePrompt',
    requestId: 'band',
    viewport: { columns: 100, rows: 30 },
    props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
  }) as never

test('the band shows the run, its progress and counts, opens the pane and dismisses', async ($, on) => {
  stub(on)
  on('ui.render', () => ({ type: 'Text', props: {}, children: [''] }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(band(surface))
    const all = await drawnText(ui)
    expect(all).toContain('Payments')
    expect(all).toContain('1/4 merged · 1 blocked')
    expect(await ui.find({ type: 'Button', key: 'orch-open' })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount(band('terminal'))
  await ui.press({ key: 'orch-hide' })
  expect(await drawnText(ui)).not.toContain('Payments')
})
