import { expect, test } from 'claude-code/testing'

import type { Effect, Event, Report, RunState, Step } from '../hooks/engine'
import { start, step, totals } from '../hooks/engine'
import { taskOf } from '../hooks/prompts'
import type { Plan } from '../hooks/plan'

import { config, plan } from './fixture'

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
    // Takes a slice through dev, the check and QA to the integration queue.
    pass(id: string, devSpawn: Effect | undefined) {
      const checked = h.finish(devSpawn, { kind: 'dev', committed: true, summary: `did ${id}` })
      expect(checked).toContainEqual({ kind: 'check-dev', slice: id })
      const qa = h.ev({ kind: 'dev-checked', slice: id, isClean: true, isAdvanced: true })
      expect(qa[0]).toEqual({ kind: 'clean-for-qa', slice: id })
      return h.finish(qa.find(e => e.kind === 'spawn'), { kind: 'qa', pass: true, defects: [] })
    },
  }
  return h
}

const spawnOf = (effects: Effect[]) => effects.find((e): e is Extract<Effect, { kind: 'spawn' }> => e.kind === 'spawn')
const kinds = (effects: Effect[]) => effects.map(e => e.kind)

test('a run creates the integration branch first and starts nothing before it is ready', () => {
  const effects = start(plan(), config, { completed: [], other: [] }, 'run1', 0).effects
  expect(effects).toEqual([{ kind: 'create-integration', repo: 'timebase' }])
})

test('ready slices start by most downstream work first, dependents wait for the merge', () => {
  const h = harness()
  const effects = h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/src/flow/timebase/feat/RVR/payments' })
  expect(effects).toEqual([
    { kind: 'create-slice', slice: '107' },
    { kind: 'create-slice', slice: '109' },
  ])
  expect(h.slice('108').phase).toBe('waiting')
})

test('a full run: dev, check, QA, integrate one at a time, final QA, done', () => {
  const h = harness()
  h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/feat/RVR/payments' })

  const dev107 = spawnOf(h.ev({ kind: 'slice-ready', slice: '107', path: 'D:/r/x', baseSha: 'b0' }))
  expect(dev107).toMatchObject({ role: 'dev', slice: '107', round: 1, rung: { model: 'haiku', effort: 'high' } })
  const dev109 = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  expect(dev109).toMatchObject({ role: 'dev', slice: '109', rung: { model: 'sonnet', effort: 'high' } })

  expect(h.pass('107', dev107)).toContainEqual({ kind: 'integrate', slice: '107' })
  // 109 passes QA while 107 integrates: it queues instead of merging alongside.
  expect(kinds(h.pass('109', dev109))).not.toContain('integrate')
  expect(h.slice('109').phase).toBe('queued')

  const merged = h.ev({ kind: 'integrated', slice: '107', isMerged: true, commit: 'c107' })
  expect(merged).toContainEqual({ kind: 'remove-slice', slice: '107' })
  expect(merged).toContainEqual({ kind: 'close-issue', slice: '107' })
  expect(merged).toContainEqual({ kind: 'create-slice', slice: '108' })
  expect(merged).toContainEqual({ kind: 'integrate', slice: '109' })
  expect(h.state.handoff['107']).toMatch(/c107: did 107/)

  h.ev({ kind: 'integrated', slice: '109', isMerged: true, commit: 'c109' })
  const dev108 = spawnOf(h.ev({ kind: 'slice-ready', slice: '108', path: 'D:/r/z', baseSha: 'c109' }))
  h.pass('108', dev108)

  const final = spawnOf(h.ev({ kind: 'integrated', slice: '108', isMerged: true, commit: 'c108' }))
  expect(final).toMatchObject({ role: 'final-qa', repo: 'timebase', rung: { model: 'opus', effort: 'xhigh' } })

  const end = h.finish(final, { kind: 'final-qa', pass: true, findings: [] })
  expect(end).toContainEqual({ kind: 'finished' })
  expect(h.state.status).toBe('done')
  expect(totals(h.state, 2)).toMatchObject({ slices: 3, merged: 3, blocked: 0, running: 0 })
})

test('each QA rejection climbs one rung with its defects; the top rung trips the breaker for that chain only', () => {
  const h = harness()
  h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' })
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
  h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' })
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
  h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' })
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
  h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' })
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  const effects = h.finish(dev, null, 'refusal')
  expect(effects.find(e => e.kind === 'blocker')).toMatchObject({ blocker: { reason: expect.stringMatching(/refused/) } })
})

test('a merge conflict goes to a resolve agent at the slice rung, and frees integration for the next', () => {
  const h = harness()
  h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' })
  const dev107 = spawnOf(h.ev({ kind: 'slice-ready', slice: '107', path: 'D:/r/x', baseSha: 'b0' }))
  const dev109 = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  h.pass('107', dev107)
  h.pass('109', dev109)

  const effects = h.ev({ kind: 'integrated', slice: '107', isMerged: false, conflicts: ['src/a.cs'] })
  expect(spawnOf(effects)).toMatchObject({ role: 'resolve', slice: '107', round: 1, rung: { model: 'haiku', effort: 'high' } })
  expect(effects).toContainEqual({ kind: 'integrate', slice: '109' })
  expect(h.slice('107')).toMatchObject({ phase: 'resolving', conflicts: ['src/a.cs'], resolveAttempts: 1 })
  expect(effects.some(e => e.kind === 'blocker')).toBe(false)
})

function conflicted() {
  const h = harness()
  h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' })
  const dev107 = spawnOf(h.ev({ kind: 'slice-ready', slice: '107', path: 'D:/r/x', baseSha: 'b0' }))
  const dev109 = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  h.pass('109', dev109)
  h.ev({ kind: 'integrated', slice: '109', isMerged: true, commit: 'c109' })
  h.pass('107', dev107)
  const resolve = spawnOf(h.ev({ kind: 'integrated', slice: '107', isMerged: false, conflicts: ['src/a.cs'] }))
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
  expect(h.finish(qa, { kind: 'qa', pass: true, defects: [], criteria: verdicts })).toContainEqual({ kind: 'integrate', slice: '107' })
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
  let s = start(p, config, { completed: ['109'], other: [] }, 'run4', 0).state
  s = step(s, { kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' }, 1).state
  s = step(s, { kind: 'slice-ready', slice: '107', path: 'D:/r/x', baseSha: 'b0' }, 1).state
  for (let i = 0; i < 2; i++) s = step(s, { kind: 'spawn-failed', key: Object.keys(s.agents)[0]!, reason: 'x' }, 1).state
  const judge = Object.values(s.agents).find(a => a.role === 'final-qa')!
  s = step(s, { kind: 'spawned', key: judge.key, agentId: 'f' }, 1).state
  s = step(s, { kind: 'report', agentId: 'f', report: { kind: 'final-qa', pass: true, findings: [] } }, 1).state
  s = step(s, { kind: 'ended', agentId: 'f', reason: 'answer' }, 1).state
  expect(s).toMatchObject({ status: 'done', finals: { timebase: { phase: 'pass' } } })

  s = step(s, { kind: 'retry', at: '107', answer: 'go' }, 2).state
  expect(s.finals.timebase!.phase).toBe('idle')
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

test('takeover fresh resets the worktree when the climb changes model, and drops the old defects', () => {
  const h = harness(plan(), { ...config, takeover: 'fresh' })
  h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' })
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '107', path: 'D:/r/x', baseSha: 'b0' }))
  h.finish(dev, { kind: 'dev', committed: true, summary: 'haiku try' })
  const qa = spawnOf(h.ev({ kind: 'dev-checked', slice: '107', isClean: true, isAdvanced: true }))
  const effects = h.finish(qa, { kind: 'qa', pass: false, defects: ['wrong design'] })

  expect(kinds(effects)).toEqual(['log', 'reset-slice', 'spawn'])
  expect(h.slice('107').defects).toBeNull()
})

test('a failed final QA goes to remediation, and a fresh judge grades every fix', () => {
  const p = plan({ slices: [plan().slices[2]!] })
  const h = harness(p)
  h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' })
  const dev = spawnOf(h.ev({ kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }))
  h.pass('109', dev)
  const judge = spawnOf(h.ev({ kind: 'integrated', slice: '109', isMerged: true, commit: 'c1' }))

  const fix = spawnOf(h.finish(judge, { kind: 'final-qa', pass: false, findings: ['docs/x.md:3 - wrong flag - expected --ready'] }))
  expect(fix).toMatchObject({ role: 'remediate', round: 1, rung: { model: 'sonnet', effort: 'high' } })

  const rejudge = spawnOf(h.finish(fix, { kind: 'remediate', committed: true, summary: 'fixed the flag' }))
  expect(rejudge).toMatchObject({ role: 'final-qa' })
  expect(rejudge?.key).not.toBe(judge?.key)

  expect(h.finish(rejudge, { kind: 'final-qa', pass: true, findings: [] })).toContainEqual({ kind: 'finished' })
})

test('slices closed before the run count as landed and satisfy their dependents', () => {
  const s = start(plan(), config, { completed: ['107'], other: [] }, 'run2', 0)
  const effects = step(s.state, { kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' }, 1).effects
  expect(effects).toEqual([
    { kind: 'create-slice', slice: '108' },
    { kind: 'create-slice', slice: '109' },
  ])
})

test('concurrency caps how many slices run at once', () => {
  const p = plan({ slices: plan().slices.map(s => ({ ...s, deps: [] })) })
  const h = harness(p, { ...config, concurrency: 1 })
  expect(h.ev({ kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' })).toHaveLength(1)
})

test('a final QA skipped when a run ended with nothing merged runs once a retry lands work', () => {
  const p = plan({ slices: [plan().slices[2]!] })
  let s = start(p, config, { completed: [], other: [] }, 'run3', 0).state
  s = step(s, { kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' }, 1).state
  s = step(s, { kind: 'slice-ready', slice: '109', path: 'D:/r/y', baseSha: 'b0' }, 1).state
  s = step(s, { kind: 'spawn-failed', key: Object.keys(s.agents)[0]!, reason: 'x' }, 1).state
  s = step(s, { kind: 'spawn-failed', key: Object.keys(s.agents)[0]!, reason: 'x' }, 1).state
  expect(s.status).toBe('done')
  expect(s.finals.timebase!.phase).toBe('skipped')

  s = step(s, { kind: 'retry', at: '109', answer: 'go' }, 2).state
  const devKey = Object.keys(s.agents)[0]!
  s = step(s, { kind: 'spawned', key: devKey, agentId: 'd' }, 2).state
  s = step(s, { kind: 'report', agentId: 'd', report: { kind: 'dev', committed: true, summary: 'x' } }, 2).state
  s = step(s, { kind: 'ended', agentId: 'd', reason: 'answer' }, 2).state
  s = step(s, { kind: 'dev-checked', slice: '109', isClean: true, isAdvanced: true }, 2).state
  const qaKey = Object.values(s.agents).find(a => a.role === 'qa')!.key
  s = step(s, { kind: 'spawned', key: qaKey, agentId: 'q' }, 2).state
  s = step(s, { kind: 'report', agentId: 'q', report: { kind: 'qa', pass: true, defects: [] } }, 2).state
  s = step(s, { kind: 'ended', agentId: 'q', reason: 'answer' }, 2).state
  const last = step(s, { kind: 'integrated', slice: '109', isMerged: true, commit: 'c' }, 3)
  expect(last.effects.find(e => e.kind === 'spawn')).toMatchObject({ role: 'final-qa' })
})
