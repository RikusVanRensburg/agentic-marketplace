import { expect, test } from 'claude-code/testing'

import { parseLog, statsText } from '../hooks/stats'

const row = (o: Record<string, unknown>) =>
  JSON.stringify({ run: 'r1', round: 1, effort: 'high', verdict: 'pass', durationMs: 20000, usage: { input: 10, output: 1000, cacheRead: 5000, cacheWrite: 4000 }, ...o })

const LOG = [
  row({ at: 't1', role: 'dev', mode: 'haiku-first', model: 'haiku' }),
  row({ at: 't1', role: 'qa', mode: 'haiku-first', model: 'opus' }),
  row({ at: 't2', role: 'dev', mode: 'sonnet-first', model: 'sonnet' }),
  row({ at: 't2', role: 'qa', mode: 'sonnet-first', model: 'opus', verdict: 'fail' }),
  row({ at: 't2', role: 'dev', mode: 'sonnet-first', model: 'sonnet', effort: 'xhigh', round: 2 }),
  row({ at: 't2', role: 'qa', mode: 'sonnet-first', model: 'opus', round: 2 }),
  row({ at: 'final:calc', role: 'final-qa', mode: null, model: 'opus', effort: 'xhigh', round: 0 }),
  'not json',
].join('\n')

test('the round logs summarise by start mode per slice and by rung per round', () => {
  const rows = parseLog(LOG)
  expect(rows).toHaveLength(7)
  const text = statsText(rows)
  expect(text).toContain('7 rounds over 1 run.')
  expect(text).toContain('haiku-first: 1 slices · QA pass on round 1 100% · rounds to pass 1.0')
  expect(text).toContain('sonnet-first: 1 slices · QA pass on round 1 0% · rounds to pass 2.0 · dev output 2k')
  expect(text).toContain('qa opus/high: 3 · pass 67%')
  expect(text).toContain('final-qa opus/xhigh: 1 · pass 100%')
})

test('no rounds says so', () => {
  expect(statsText([])).toBe('No orchestrator rounds logged yet.')
})
