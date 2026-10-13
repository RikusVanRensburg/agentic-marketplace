import { expect, test } from 'claude-code/testing'

import { configOf, parseLadder, parseRung } from '../hooks/config'
import { briefProblems, clashOf, cycleOf, integrationBranchOf, reconcileProblems, sliceBranchOf, validatePlan } from '../hooks/plan'

import { BRIEF, config, plan } from './fixture'

const errorsOf = (input: unknown) => {
  const result = validatePlan(input, config)
  return result.isValid ? [] : result.errors
}

test('the default config parses into both ladders and the QA rungs', () => {
  expect(config.ladders['sonnet-first']).toEqual([
    { model: 'sonnet', effort: 'high' },
    { model: 'sonnet', effort: 'xhigh' },
    { model: 'opus', effort: 'high' },
  ])
  expect(config.ladders['haiku-first'][0]).toEqual({ model: 'haiku', effort: 'high' })
  expect(config.qa).toEqual({ model: 'opus', effort: 'high' })
  expect(config.finalQa).toEqual({ model: 'opus', effort: 'xhigh' })
  expect(config.qaCleanKeep).toEqual(['node_modules', 'packages'])
})

test('a rung takes model/effort, a full model id, and high when effort is left out', () => {
  expect(parseRung('claude-sonnet-5-5/max')).toEqual({ model: 'claude-sonnet-5-5', effort: 'max' })
  expect(parseRung('opus')).toEqual({ model: 'opus', effort: 'high' })
  expect(typeof parseRung('opus/extreme')).toBe('string')
  expect(typeof parseLadder(' , ')).toBe('string')
})

test('a bad setting is refused with its name', () => {
  const result = configOf({ takeover: 'maybe', concurrency: 0, qa: 'opus/loud' })
  expect(result.isValid).toBe(false)
  if (!result.isValid) {
    expect(result.errors.join('\n')).toMatch(/takeover/)
    expect(result.errors.join('\n')).toMatch(/concurrency/)
    expect(result.errors.join('\n')).toMatch(/qa:/)
  }
})

test('a sound plan passes and names its branches by the orchestrator shape', () => {
  const p = plan()
  expect(errorsOf(p)).toEqual([])
  expect(integrationBranchOf(p)).toBe('feat/RVR/payments')
  expect(sliceBranchOf(p, p.slices[0]!)).toBe('feat/RVR/orchestration/payments/107-core-dto')
})

test('unknown deps, self deps and cycles are refused before any agent starts', () => {
  const p = plan()
  expect(errorsOf({ ...p, slices: [{ ...p.slices[1]!, deps: ['999'] }] }).join('\n')).toMatch(/depends on 999/)
  expect(errorsOf({ ...p, slices: [{ ...p.slices[1]!, deps: ['108'] }] }).join('\n')).toMatch(/depends on itself/)

  const cyclic = [
    { ...p.slices[0]!, deps: ['108'] },
    { ...p.slices[1]!, deps: ['107'] },
  ]
  expect(cycleOf(cyclic)).toEqual(['107', '108', '107'])
  expect(errorsOf({ ...p, slices: cyclic }).join('\n')).toMatch(/cycle: 107 -> 108 -> 107/)
})

test('duplicate ids and clashing branches are refused', () => {
  const p = plan()
  expect(errorsOf({ ...p, slices: [p.slices[1]!, p.slices[1]!] }).join('\n')).toMatch(/used twice/)
  expect(clashOf(['a/b', 'a/b/c'])).toEqual(['a/b', 'a/b/c'])
  expect(clashOf(['a/b', 'a/bc'])).toBeNull()
  expect(errorsOf({ ...p, integrationBranch: 'feat/RVR/orchestration/payments' }).join('\n')).toMatch(/must not sit under orchestration/)
  expect(errorsOf({ ...p, slices: [{ ...p.slices[2]!, branch: 'feat/RVR/payments/docs' }] }).join('\n')).toMatch(/cannot both exist/)
})

test('a haiku-first slice is refused when its brief misses any part', () => {
  expect(briefProblems(BRIEF)).toEqual([])
  expect(briefProblems(undefined)).toEqual(['no brief'])
  expect(briefProblems({ ...BRIEF, goal: 'Add the DTO. Then wire it.' })).toEqual(['goal is more than one sentence'])
  expect(briefProblems({ ...BRIEF, inScope: { files: [], symbols: ['X'] }, commands: { build: '', test: 'x' } })).toEqual(['no files in scope', 'no build command'])

  const p = plan()
  const bare = { ...p.slices[0]!, brief: undefined }
  expect(errorsOf({ ...p, slices: [bare] }).join('\n')).toMatch(/haiku-first brief: no brief/)
  // The same slice sonnet-first needs no brief.
  expect(errorsOf({ ...p, slices: [{ ...bare, mode: 'sonnet-first' }] })).toEqual([])
})

test('a plain plan needs each slice body; a GitHub slice id is its issue number', () => {
  const p = plan()
  const plain = { ...p, source: { kind: 'plain', text: 'Build payments.' } as const }
  expect(errorsOf(plain).join('\n')).toMatch(/needs the slice body/)
  expect(errorsOf({ ...plain, slices: p.slices.map(s => ({ ...s, id: `t${s.id}`, deps: s.deps.map(d => `t${d}`), body: 'Do it.' })) })).toEqual([])
  expect(errorsOf({ ...p, slices: [{ ...p.slices[2]!, id: 't9' }] }).join('\n')).toMatch(/issue number/)
})

test('a repo without build and test commands is refused, since integration runs them', () => {
  const p = plan()
  expect(errorsOf({ ...p, repos: { timebase: { ...p.repos.timebase!, commands: { build: '', test: '' } } } }).join('\n')).toMatch(/build and test/)
})

test('a slice closed without completing is fine alone, refused when something depends on it', () => {
  const p = plan()
  expect(reconcileProblems(p, { completed: [], other: ['109'] })).toEqual([])
  expect(reconcileProblems(p, { completed: [], other: ['107'] })).toEqual(['slice 108 depends on 107, which is closed without being completed'])
  expect(reconcileProblems(p, { completed: ['107'], other: [] })).toEqual([])
})
