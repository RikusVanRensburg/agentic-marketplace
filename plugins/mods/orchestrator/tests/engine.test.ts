import { expect, test } from 'claude-code/testing'

import type { Effect, Event, MergeReport, Report, RunState, SliceMerge, Step } from '../hooks/engine'
import { collidedWith, inFlight, start, step, totals, upgrade } from '../hooks/engine'
import { taskOf } from '../hooks/prompts'
import type { Plan } from '../hooks/plan'

import { config, plan } from './fixture'

const mergeReport = (slices: SliceMerge[], extra: Partial<MergeReport> = {}): MergeReport => ({ kind: 'merge', baseRed: false, failing: [], slices, flaky: [], summary: 'merged', ...extra })

// Drives the reducer the way register.tsx does: apply an event, read the effects, answer them.
function harness(p: Plan = plan(), cfg = config) {
  let state: RunState
  let ids = 0
  const keep = (s: Step) => {
    state = s.state
    return s.effects
  }
  keep(start(p, cfg, { completed: [], other: [] }, 'run1', 0))

  const h = {
    get state() {
      return state
    },
    ev: (event: Event) => keep(step(state, event, 1)),
    slice: (id: string) => state.slices[id]!,
    // Starts the agent an effect asked for and finishes it with the given report.
    finish(effect: Effect | undefined, report: Report | null, reason: 'answer' | 'error' | 'refusal' | 'lost' = 'answer') {
      if (!effect || effect.kind !== 'spawn') throw new Error(`expected a spawn, got ${JSON.stringify(effect)}`)
      const agentId = `a${++ids}`
      h.ev({ kind: 'spawned', key: effect.key, agentId })
      if (report) h.ev({ kind: 'report', agentId, report })
      return h.ev({ kind: 'ended', agentId, reason, usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, durationMs: 100 })
    },
    // The mod reads HEAD for the batch it just started and spawns the merge agent.
    head(effects: Effect[]) {
      expect(effects).toContainEqual({ kind: 'read-head', repo: 'timebase' })
      const agent = spawnOf(h.ev({ kind: 'head-read', repo: 'timebase', head: 'h0' }))
      expect(agent).toMatchObject({ role: 'merge', repo: 'timebase' })
      return agent
    },
    // Answers a started batch: HEAD, the merge agent's report, and the mod's check of it.
    merge(effects: Effect[], report: MergeReport, commits: Record<string, string> = {}) {
      const checked = h.finish(h.head(effects), report)
      expect(checked.find(e => e.kind === 'check-merge')).toBeTruthy()
      return h.ev({ kind: 'merge-checked', repo: 'timebase', problem: null, commits })
    },
    // The integration worktree is made and its baseline found green.
    ready() {
      return h.merge(h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' }), mergeReport([]))
    },
    // Takes a slice through dev, the check and QA to the integration queue.
    pass(id: string, devSpawn: Effect | undefined) {
      const checked = h.finish(devSpawn, { kind: 'dev', committed: true, summary: `did ${id}` })
      expect(checked).toContainEqual({ kind: 'check-dev', slice: id })
      const qa = h.ev({ kind: 'dev-checked', slice: id, isClean: true, isAdvanced: true })
      expect(kinds(qa)).toEqual(['spawn'])
      return h.finish(spawnOf(qa), { kind: 'qa', pass: true, defects: [] })
    },
  }
  return h
}

const spawnOf = (effects: Effect[]) => effects.find((e): e is Extract<Effect, { kind: 'spawn' }> => e.kind === 'spawn')
const kinds = (effects: Effect[]) => effects.map(e => e.kind)
const merged = (slice: string): SliceMerge => ({ slice, outcome: 'merged' })

// What 0.1.x stored: no merge ladder, a single integrating slot, an integration with no batch.
function storedBy01(): RunState {
  const s = start(plan(), config, { completed: [], other: [] }, 'old', 0).state as unknown as Record<string, unknown>
  const { merge: _merge, ...oldConfig } = config
  s.config = { ...oldConfig, qaCleanKeep: ['node_modules'] }
  s.integration = { timebase: { branch: 'feat/RVR/payments', path: 'D:/r/i', isReady: true } }
  s.integrating = '107'
  const slices = s.slices as RunState['slices']
  slices['107']!.phase = 'integrating'
  return s as unknown as RunState
}

test('a run stored by 0.1.x is brought to this shape: the merge ladder, an idle integration, its merge queued again', () => {
  const s = upgrade(storedBy01(), config)
  expect(s.config.merge).toEqual(config.merge)
  expect(s.integration.timebase).toMatchObject({ isReady: true, merging: null, round: 1, infraRetried: false, rounds: [], flaky: [] })
  expect('integrating' in s).toBe(false)
  expect(s.slices['107']!.phase).toBe('queued')
  expect(s.queue).toEqual(['107'])
})

test('an upgraded run steps on: the queued merge goes to the merge agent', () => {
  const s = { ...upgrade(storedBy01(), config), status: 'running' as const }
  const { effects } = step(s, { kind: 'drop', slice: '109' }, 1)
  expect(effects).toContainEqual({ kind: 'read-head', repo: 'timebase' })
})

test('a run stored by this version comes through unchanged', () => {
  const h = harness()
  h.ready()
  expect(upgrade(h.state, config)).toEqual(h.state)
})

test('a run creates the integration branch first and starts nothing before it is ready', () => {
  const effects = start(plan(), config, { completed: [], other: [] }, 'run1', 0).effects
  expect(effects).toEqual([{ kind: 'create-integration', repo: 'timebase' }])
})

test('no slice starts until the merge agent finds the baseline green', () => {
  const h = harness()
  const made = h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' })
  expect(made).toEqual([{ kind: 'read-head', repo: 'timebase' }])
  const agent = h.head(made)
  expect(taskOf(h.state, 'merge', 'timebase', undefined, 1, config.merge[0]!)).toMatch(/Batch start: h0[\s\S]*baseline check/)
  expect(agent).toMatchObject({ rung: { model: 'sonnet', effort: 'medium' } })
  expect(h.state.integration.timebase!.isReady).toBe(false)

  const checked = h.finish(agent, mergeReport([]))
  expect(checked).toContainEqual({ kind: 'check-merge', repo: 'timebase', before: 'h0', merged: [], unmerged: [] })
  expect(h.ev({ kind: 'merge-checked', repo: 'timebase', problem: null, commits: {} })).toEqual([
    { kind: 'create-slice', slice: '107' },
    { kind: 'create-slice', slice: '109' },
  ])
  expect(h.slice('108').phase).toBe('waiting')
})

test('a red baseline blocks the integration branch with what fails, and a retry checks it again', () => {
  const h = harness()
  const blocked = h.merge(h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' }), mergeReport([], { baseRed: true, failing: ['OpcUa.Tests.Reads [FAIL]'] }))
  expect(blocked.find(e => e.kind === 'blocker')).toMatchObject({ blocker: { at: 'integration:timebase', defects: ['OpcUa.Tests.Reads [FAIL]'] } })
  expect(kinds(blocked)).not.toContain('create-slice')

  expect(h.ev({ kind: 'retry', at: 'integration:timebase', answer: 'fixed the port' })).toContainEqual({ kind: 'create-integration', repo: 'timebase' })
  h.head(h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' }))
  expect(taskOf(h.state, 'merge', 'timebase', undefined, 1, config.merge[0]!)).toMatch(/guidance on the last integration blocker: fixed the port/)
})

test('a full run: dev, check, QA, merge batches, final QA, done', () => {
  const h = harness()
  h.ready()

  const dev107 = spawnOf(h.ev({ kind: 'slice-ready', slice: '107', path: 'D:/r/x', baseSha: 'b0' }))
  expect(dev107).toMatchObject({ role: 'dev', slice: '107', round: 1, rung: { model: 'haiku', effort: 'high' } })
  const dev109 = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  expect(dev109).toMatchObject({ role: 'dev', slice: '109', rung: { model: 'sonnet', effort: 'high' } })

  const batch107 = h.pass('107', dev107)
  expect(h.slice('107').phase).toBe('integrating')
  // 109 passes QA while 107's batch is out: it waits for the next batch.
  expect(kinds(h.pass('109', dev109))).not.toContain('read-head')
  expect(h.slice('109').phase).toBe('queued')

  const after107 = h.merge(batch107, mergeReport([merged('107')]), { [h.slice('107').branch]: 'c107' })
  expect(after107).toContainEqual({ kind: 'remove-slice', slice: '107' })
  expect(after107).toContainEqual({ kind: 'close-issue', slice: '107' })
  expect(after107).toContainEqual({ kind: 'create-slice', slice: '108' })
  expect(after107).toContainEqual({ kind: 'read-head', repo: 'timebase' })
  expect(h.slice('107').commit).toBe('c107')
  expect(h.state.handoff['107']).toMatch(/c107: did 107/)
  expect(h.slice('109').phase).toBe('integrating')

  h.merge(after107, mergeReport([merged('109')]))
  const dev108 = spawnOf(h.ev({ kind: 'slice-ready', slice: '108', path: 'D:/r/z', baseSha: 'c109' }))
  const final = spawnOf(h.merge(h.pass('108', dev108), mergeReport([merged('108')])))
  expect(final).toMatchObject({ role: 'final-qa', repo: 'timebase', rung: { model: 'opus', effort: 'xhigh' } })

  const end = h.finish(final, { kind: 'final-qa', pass: true, findings: [] })
  expect(end).toContainEqual({ kind: 'finished' })
  expect(h.state.status).toBe('done')
  expect(totals(h.state, 2)).toMatchObject({ slices: 3, merged: 3, blocked: 0, running: 0 })
})

test('every queued slice of a repo goes to the merge agent as one batch, in queue order', () => {
  const p = plan({ slices: plan().slices.map(s => ({ ...s, deps: [] })) })
  const h = harness(p)
  h.ready()
  const devs = ['107', '108', '109'].map(id => spawnOf(h.ev({ kind: 'slice-ready', slice: id, path: `D:/r/${id}`, baseSha: 'b0' })))
  const first = h.pass('107', devs[0])
  h.pass('108', devs[1])
  h.pass('109', devs[2])
  // 107 went alone; 108 and 109 wait together for the next batch.
  const next = h.merge(first, mergeReport([merged('107')]))
  expect(h.state.integration.timebase!.merging).toEqual(['108', '109'])
  h.head(next)
  expect(taskOf(h.state, 'merge', 'timebase', undefined, 1, config.merge[0]!)).toMatch(/108: git merge --no-ff -m "Merge [^"]*endpoint \(108 Endpoint\)"[\s\S]*109: git merge/)
})

test('each QA rejection climbs one rung with its defects; the top rung trips the breaker for that chain only', () => {
  const h = harness()
  h.ready()
  let dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '107', path: 'D:/r/x', baseSha: 'b0' }))

  for (const model of ['sonnet', 'opus']) {
    h.finish(dev, { kind: 'dev', committed: true, summary: 'tried' })
    const qa = spawnOf(h.ev({ kind: 'dev-checked', slice: '107', isClean: true, isAdvanced: true }))
    dev = spawnOf(h.finish(qa, { kind: 'qa', pass: false, defects: ['Amount is not validated'] }))
    expect(dev).toMatchObject({ role: 'dev', rung: { model } })
    expect(h.slice('107').defects).toEqual(['Amount is not validated'])
  }

  h.finish(dev, { kind: 'dev', committed: true, summary: 'tried' })
  const qa = spawnOf(h.ev({ kind: 'dev-checked', slice: '107', isClean: true, isAdvanced: true }))
  const tripped = h.finish(qa, { kind: 'qa', pass: false, defects: ['still wrong'] })

  expect(tripped.find(e => e.kind === 'blocker')).toMatchObject({ blocker: { at: '107', rung: 'opus/high', defects: ['still wrong'], worktree: 'D:/r/x' } })
  expect(h.slice('107').phase).toBe('blocked')
  expect(h.slice('108').phase).toBe('halted')
  expect(h.slice('109').phase).toBe('starting')
})

test('a dev that returns without committing, or leaves the tree dirty, climbs like a rejection', () => {
  const h = harness()
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))

  const next = spawnOf(h.finish(dev, { kind: 'dev', committed: false, summary: 'could not find the file' }))
  expect(next).toMatchObject({ role: 'dev', round: 2, rung: { model: 'sonnet', effort: 'xhigh' } })

  h.finish(next, { kind: 'dev', committed: true, summary: 'done' })
  const third = spawnOf(h.ev({ kind: 'dev-checked', slice: '109', isClean: false, isAdvanced: true }))
  expect(third).toMatchObject({ role: 'dev', round: 3 })
  expect(h.slice('109').defects?.[0]).toMatch(/uncommitted/)
})

test('an agent with no report gets one retry on the same rung, then a blocker; a lost agent always reruns', () => {
  const h = harness()
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))

  const lost = spawnOf(h.finish(dev, null, 'lost'))
  expect(lost).toMatchObject({ role: 'dev', round: 1 })

  const retry = spawnOf(h.finish(lost, null, 'error'))
  expect(retry).toMatchObject({ role: 'dev', round: 1 })

  const blocked = h.finish(retry, null, 'answer')
  expect(blocked.find(e => e.kind === 'blocker')).toMatchObject({ blocker: { at: '109' } })
  expect(h.slice('109').phase).toBe('blocked')
})

test('a refusal blocks at once', () => {
  const h = harness()
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  const effects = h.finish(dev, null, 'refusal')
  expect(effects.find(e => e.kind === 'blocker')).toMatchObject({ blocker: { reason: expect.stringMatching(/refused/) } })
})

test('a merge conflict goes to a resolve agent at the slice rung, and frees integration for the next', () => {
  const h = harness()
  h.ready()
  const dev107 = spawnOf(h.ev({ kind: 'slice-ready', slice: '107', path: 'D:/r/x', baseSha: 'b0' }))
  const dev109 = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  const batch = h.pass('107', dev107)
  h.pass('109', dev109)

  const effects = h.merge(batch, mergeReport([{ slice: '107', outcome: 'conflict', conflicts: ['src/a.cs'] }]))
  expect(spawnOf(effects)).toMatchObject({ role: 'resolve', slice: '107', round: 1, rung: { model: 'haiku', effort: 'high' } })
  expect(effects).toContainEqual({ kind: 'read-head', repo: 'timebase' })
  expect(h.state.integration.timebase!.merging).toEqual(['109'])
  expect(h.slice('107')).toMatchObject({ phase: 'resolving', conflicts: ['src/a.cs'], resolveAttempts: 1 })
  expect(effects.some(e => e.kind === 'blocker')).toBe(false)
})

test('a slice that turns the suite red goes to a resolve agent with the failing tests', () => {
  const h = harness()
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  const effects = h.merge(h.pass('109', dev), mergeReport([{ slice: '109', outcome: 'red', failing: ['Docs.Tests.Links [FAIL]'] }]))
  expect(spawnOf(effects)).toMatchObject({ role: 'resolve', slice: '109' })
  expect(h.slice('109')).toMatchObject({ phase: 'resolving', mergeFailures: ['Docs.Tests.Links [FAIL]'], conflicts: [] })
  const task = taskOf(h.state, 'resolve', 'timebase', '109', 1, config.ladders['sonnet-first'][0]!)
  expect(task).toMatch(/turned these red, twice:\n- Docs.Tests.Links \[FAIL\]/)
  expect(task).not.toMatch(/Conflicting files/)
})

test('a red the resolve agent cannot reproduce goes back to the merge, then blocks', () => {
  const h = harness()
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  const red = () => mergeReport([{ slice: '109', outcome: 'red', failing: ['T [FAIL]'] }])
  let resolve = spawnOf(h.merge(h.pass('109', dev), red()))
  const again = h.finish(resolve, { kind: 'resolve', resolved: false, summary: 'green here', notReproduced: true })
  expect(again).toContainEqual({ kind: 'read-head', repo: 'timebase' })
  expect(h.slice('109').phase).toBe('integrating')

  resolve = spawnOf(h.merge(again, red()))
  h.finish(resolve, { kind: 'resolve', resolved: false, summary: 'green here', notReproduced: true })
  expect(h.slice('109')).toMatchObject({ phase: 'blocked', blocker: expect.stringMatching(/not reproduced on the slice: T \[FAIL\]/) })
})

test('a slice the merge agent did not try goes back to the front of the queue', () => {
  const p = plan({ slices: plan().slices.map(s => ({ ...s, deps: [] })) })
  const h = harness(p)
  h.ready()
  const dev107 = spawnOf(h.ev({ kind: 'slice-ready', slice: '107', path: 'D:/r/x', baseSha: 'b0' }))
  const next = h.merge(h.pass('107', dev107), mergeReport([]))
  expect(next).toContainEqual({ kind: 'read-head', repo: 'timebase' })
  expect(h.state.integration.timebase!.merging).toEqual(['107'])
})

test('merge work that does not check out goes again on the same rung, then climbs, then blocks the integration', () => {
  const h = harness()
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  let agent = h.head(h.pass('109', dev))
  const rungs: string[] = []
  for (let i = 0; i < 6; i++) {
    h.finish(agent, mergeReport([merged('109')]))
    const effects = h.ev({ kind: 'merge-checked', repo: 'timebase', problem: 'merge abc is not the merge git makes by itself', commits: {} })
    agent = spawnOf(effects)
    if (!agent) {
      expect(effects.find(e => e.kind === 'blocker')).toMatchObject({ blocker: { at: 'integration:timebase', reason: expect.stringMatching(/did not check out[\s\S]*merge ladder is spent/), rung: 'opus/high' } })
      break
    }
    rungs.push(`${agent.rung.model}/${agent.rung.effort}`)
  }
  expect(rungs).toEqual(['sonnet/medium', 'sonnet/high', 'sonnet/high', 'opus/high', 'opus/high'])
  expect(h.slice('109').phase).toBe('queued')
  expect(h.state.integration.timebase!.merging).toBeNull()
})

test('a merge agent that ends with no report runs again on the same rung, from the same batch start', () => {
  const h = harness()
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  const agent = h.head(h.pass('109', dev))
  const again = spawnOf(h.finish(agent, null, 'error'))
  expect(again).toMatchObject({ role: 'merge', round: 1 })
  expect(h.state.integration.timebase).toMatchObject({ before: 'h0', step: 'agent', merging: ['109'] })
})

test('a dirty integration worktree blocks the batch before any agent, and keeps the slices queued', () => {
  const h = harness()
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  h.pass('109', dev)
  const effects = h.ev({ kind: 'head-failed', repo: 'timebase', reason: 'the integration worktree has uncommitted changes' })
  expect(effects.find(e => e.kind === 'blocker')).toMatchObject({ blocker: { at: 'integration:timebase' } })
  expect(h.slice('109').phase).toBe('queued')
  expect(kinds(effects)).not.toContain('read-head')
})

test('flaky tests the merge agent names are kept on the integration', () => {
  const h = harness()
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  h.merge(h.pass('109', dev), mergeReport([merged('109')], { flaky: ['MqttVersionTests.A_broker_DISCONNECT [FAIL]'] }))
  expect(h.slice('109').phase).toBe('merged')
  expect(h.state.integration.timebase!.flaky).toEqual(['MqttVersionTests.A_broker_DISCONNECT [FAIL]'])
})

test('after a reload, the read or check a batch was in goes again', () => {
  const h = harness()
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  h.pass('109', dev)
  expect(inFlight(h.state)).toContainEqual({ kind: 'read-head', repo: 'timebase' })
  const agent = spawnOf(h.ev({ kind: 'head-read', repo: 'timebase', head: 'h0' }))
  h.finish(agent, mergeReport([merged('109')]))
  expect(inFlight(h.state)).toContainEqual({ kind: 'check-merge', repo: 'timebase', before: 'h0', merged: [h.slice('109').branch], unmerged: [] })
})

function conflicted() {
  const h = harness()
  h.ready()
  const dev107 = spawnOf(h.ev({ kind: 'slice-ready', slice: '107', path: 'D:/r/x', baseSha: 'b0' }))
  const dev109 = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  h.merge(h.pass('109', dev109), mergeReport([merged('109')]))
  const resolve = spawnOf(h.merge(h.pass('107', dev107), mergeReport([{ slice: '107', outcome: 'conflict', conflicts: ['src/a.cs'] }])))
  return { h, resolve }
}

test('a resolved merge is checked, then QA judges it with the collided slice, then it queues', () => {
  const { h, resolve } = conflicted()
  expect(h.finish(resolve, { kind: 'resolve', resolved: true, summary: 'merged both' })).toContainEqual({ kind: 'check-dev', slice: '107' })
  const qa = spawnOf(h.ev({ kind: 'dev-checked', slice: '107', isClean: true, isAdvanced: true }))
  expect(qa).toMatchObject({ role: 'qa', slice: '107' })
  expect(taskOf(h.state, 'qa', 'timebase', '107', 1, config.qa)).toMatch(/resolved merge with the slices below[\s\S]*109/)
  expect(taskOf(h.state, 'resolve', 'timebase', '107', 1, config.ladders['haiku-first'][0]!)).toMatch(/Conflicting files: src\/a.cs[\s\S]*109/)
  const verdicts = [{ slice: '107', met: true }, { slice: '109', met: true }]
  expect(h.finish(qa, { kind: 'qa', pass: true, defects: [], criteria: verdicts })).toContainEqual({ kind: 'read-head', repo: 'timebase' })
  expect(h.state.integration.timebase!.merging).toEqual(['107'])
})

test('after a resolve, a QA pass without a verdict for every collided slice, or with one unmet, resolves again', () => {
  const { h, resolve } = conflicted()
  h.finish(resolve, { kind: 'resolve', resolved: true, summary: 'merged' })
  const qa = spawnOf(h.ev({ kind: 'dev-checked', slice: '107', isClean: true, isAdvanced: true }))
  const again = spawnOf(h.finish(qa, { kind: 'qa', pass: true, defects: [], criteria: [{ slice: '107', met: true }] }))
  expect(again).toMatchObject({ role: 'resolve' })
  expect(h.slice('107').defects).toEqual(['QA reported no criteria verdict for 109'])

  h.finish(again, { kind: 'resolve', resolved: true, summary: 'merged' })
  const qa2 = spawnOf(h.ev({ kind: 'dev-checked', slice: '107', isClean: true, isAdvanced: true }))
  h.finish(qa2, { kind: 'qa', pass: true, defects: [], criteria: [{ slice: '107', met: true }, { slice: '109', met: false, note: 'line 1 changed' }] })
  expect(h.slice('107')).toMatchObject({ phase: 'blocked', defects: ["109's acceptance criteria no longer hold: line 1 changed"] })
})

test('a conflict that comes back after two resolve rounds blocks, and a retry merges it again', () => {
  const { h, resolve } = conflicted()
  let next = resolve
  for (let i = 0; i < 2; i++) {
    h.finish(next, { kind: 'resolve', resolved: true, summary: 'merged' })
    const qa = spawnOf(h.ev({ kind: 'dev-checked', slice: '107', isClean: true, isAdvanced: true }))
    const batch = h.finish(qa, { kind: 'qa', pass: true, defects: [], criteria: [{ slice: '107', met: true }, { slice: '109', met: true }] })
    next = spawnOf(h.merge(batch, mergeReport([{ slice: '107', outcome: 'conflict', conflicts: ['src/a.cs'] }])))
  }
  expect(h.slice('107')).toMatchObject({ phase: 'blocked', stoppedIn: 'integrating', blocker: expect.stringMatching(/merge conflict in src\/a.cs, after 2 resolve round/) })
  expect(h.ev({ kind: 'retry', at: '107', answer: 'merge again' })).toContainEqual({ kind: 'read-head', repo: 'timebase' })
  expect(h.slice('107').phase).toBe('integrating')
})

test('drop takes a blocked slice out of the run and keeps its dependents halted', () => {
  const { h, resolve } = conflicted()
  h.finish(resolve, { kind: 'resolve', resolved: false, summary: 'cannot', conflict: 'contradiction' })
  expect(h.slice('108').phase).toBe('halted')
  h.ev({ kind: 'drop', slice: '107' })
  expect(h.slice('107')).toMatchObject({ phase: 'descoped', isDropped: true })
  expect(h.slice('108')).toMatchObject({ phase: 'halted', blocker: 'upstream 107 was dropped' })
  expect(h.state.blockers.some(b => b.at === '107')).toBe(false)
})

test('reopening a finished run makes every final QA judge again', () => {
  const p = plan({ slices: [plan().slices[2]!, { ...plan().slices[0]!, mode: 'sonnet-first', brief: undefined }] })
  const h = harness(p)
  h.ready()
  h.ev({ kind: 'slice-ready', slice: '107', path: 'D:/r/x', baseSha: 'b0' })
  for (let i = 0; i < 2; i++) h.ev({ kind: 'spawn-failed', key: Object.values(h.state.agents).find(a => a.slice === '107')!.key, reason: 'x' })
  h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' })
  for (let i = 0; i < 2; i++) h.ev({ kind: 'spawn-failed', key: Object.values(h.state.agents).find(a => a.slice === '109')!.key, reason: 'x' })
  expect(h.state).toMatchObject({ status: 'done', finals: { timebase: { phase: 'skipped' } } })

  h.ev({ kind: 'retry', at: '107', answer: 'go' })
  expect(h.state.finals.timebase!.phase).toBe('idle')
  expect(h.state.status).toBe('running')
})

test('a requirements conflict blocks with its reason and halts the dependents', () => {
  const { h, resolve } = conflicted()
  const effects = h.finish(resolve, { kind: 'resolve', resolved: false, summary: 'cannot', conflict: '107 needs line 1 to say A, 109 says B' })
  expect(effects.find(e => e.kind === 'blocker')).toMatchObject({ blocker: { at: '107', reason: 'requirements conflict with merged work: 107 needs line 1 to say A, 109 says B' } })
  expect(h.slice('108').phase).toBe('halted')
})

test('a resolve QA rejects twice ends in a blocker', () => {
  const { h, resolve } = conflicted()
  let next = resolve
  for (let i = 0; i < 2; i++) {
    h.finish(next, { kind: 'resolve', resolved: true, summary: 'tried' })
    const qa = spawnOf(h.ev({ kind: 'dev-checked', slice: '107', isClean: true, isAdvanced: true }))
    next = spawnOf(h.finish(qa, { kind: 'qa', pass: false, defects: ['109 behaviour lost'] }))
    if (i === 0) expect(next).toMatchObject({ role: 'resolve' })
  }
  expect(h.slice('107').phase).toBe('blocked')
  expect(h.slice('107').blocker).toMatch(/failed after 2 resolve round/)
})

test('retrying a requirements conflict resolves again with the answer', () => {
  const { h, resolve } = conflicted()
  h.finish(resolve, { kind: 'resolve', resolved: false, summary: 'cannot', conflict: 'contradiction' })
  const again = spawnOf(h.ev({ kind: 'retry', at: '107', answer: 'keep 109 wording, append ours' }))
  expect(again).toMatchObject({ role: 'resolve', slice: '107' })
  expect(taskOf(h.state, 'resolve', 'timebase', '107', 1, config.ladders['haiku-first'][0]!)).toMatch(/keep 109 wording, append ours/)
})

test('takeover fresh has the new dev reset the worktree when the climb changes model, and drops the old defects', () => {
  const h = harness(plan(), { ...config, takeover: 'fresh' })
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '107', path: 'D:/r/x', baseSha: 'b0' }))
  h.finish(dev, { kind: 'dev', committed: true, summary: 'haiku try' })
  const qa = spawnOf(h.ev({ kind: 'dev-checked', slice: '107', isClean: true, isAdvanced: true }))
  const effects = h.finish(qa, { kind: 'qa', pass: false, defects: ['wrong design'] })

  expect(kinds(effects)).toEqual(['log', 'spawn'])
  expect(h.slice('107')).toMatchObject({ isFresh: true, defects: null })
  expect(taskOf(h.state, 'dev', 'timebase', '107', 2, config.ladders['haiku-first'][1]!)).toMatch(/git reset --hard b0 and git clean -fd/)

  h.finish(spawnOf(effects), { kind: 'dev', committed: true, summary: 'sonnet try' })
  expect(h.slice('107').isFresh).toBeUndefined()
})

test('a failed final QA goes to remediation, and a fresh judge grades every fix', () => {
  const p = plan({ slices: [plan().slices[2]!] })
  const h = harness(p)
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  const judge = spawnOf(h.merge(h.pass('109', dev), mergeReport([merged('109')])))

  const fix = spawnOf(h.finish(judge, { kind: 'final-qa', pass: false, findings: ['docs/x.md:3 - wrong flag - expected --ready'] }))
  expect(fix).toMatchObject({ role: 'remediate', round: 1, rung: { model: 'sonnet', effort: 'high' } })

  const rejudge = spawnOf(h.finish(fix, { kind: 'remediate', committed: true, summary: 'fixed the flag' }))
  expect(rejudge).toMatchObject({ role: 'final-qa' })
  expect(rejudge?.key).not.toBe(judge?.key)

  expect(h.finish(rejudge, { kind: 'final-qa', pass: true, findings: [] })).toContainEqual({ kind: 'finished' })
})

test('slices closed before the run count as landed and satisfy their dependents', () => {
  const s = start(plan(), config, { completed: ['107'], other: [] }, 'run2', 0)
  let state = step(s.state, { kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' }, 1).state
  state = step(state, { kind: 'head-read', repo: 'timebase', head: 'h0' }, 1).state
  const key = Object.values(state.agents).find(a => a.role === 'merge')!.key
  state = step(state, { kind: 'spawned', key, agentId: 'm' }, 1).state
  state = step(state, { kind: 'report', agentId: 'm', report: mergeReport([]) }, 1).state
  state = step(state, { kind: 'ended', agentId: 'm', reason: 'answer' }, 1).state
  const effects = step(state, { kind: 'merge-checked', repo: 'timebase', problem: null, commits: {} }, 1).effects
  expect(effects).toEqual([
    { kind: 'create-slice', slice: '108' },
    { kind: 'create-slice', slice: '109' },
  ])
})

test('concurrency caps how many slices run at once', () => {
  const p = plan({ slices: plan().slices.map(s => ({ ...s, deps: [] })) })
  const h = harness(p, { ...config, concurrency: 1 })
  expect(h.ready()).toHaveLength(1)
})

test('a final QA skipped when a run ended with nothing merged runs once a retry lands work', () => {
  const p = plan({ slices: [plan().slices[2]!] })
  const h = harness(p)
  h.ready()
  h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' })
  for (let i = 0; i < 2; i++) h.ev({ kind: 'spawn-failed', key: Object.keys(h.state.agents)[0]!, reason: 'x' })
  expect(h.state.status).toBe('done')
  expect(h.state.finals.timebase!.phase).toBe('skipped')

  const dev = spawnOf(h.ev({ kind: 'retry', at: '109', answer: 'go' }))
  const last = h.merge(h.pass('109', dev), mergeReport([merged('109')]))
  expect(spawnOf(last)).toMatchObject({ role: 'final-qa' })
})

test('a slice that merged after another started counts as collided with it, one merged before does not', () => {
  const s = start(plan(), config, { completed: [], other: [] }, 'run5', 0).state
  s.slices['107']!.rounds = [{ round: 1, role: 'dev', rung: config.qa, startedAt: 100 }]
  s.slices['108']!.mergedAt = 50
  s.slices['109']!.mergedAt = 200
  expect(collidedWith(s, '107')).toEqual(['109'])
})

test('an agent that cannot run is infrastructure: same rung once, then a blocker naming why', () => {
  const h = harness()
  h.ready()
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  const again = spawnOf(h.finish(dev, { kind: 'dev', committed: false, summary: '', cannotRun: 'worktree missing' }))
  expect(again).toMatchObject({ role: 'dev', round: 1 })
  const effects = h.finish(again, { kind: 'dev', committed: false, summary: '', cannotRun: 'worktree missing' })
  expect(effects.find(e => e.kind === 'blocker')).toMatchObject({ blocker: { reason: expect.stringMatching(/could not run: worktree missing/) } })
})
