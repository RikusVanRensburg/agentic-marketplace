import { expect, test } from 'claude-code/testing'

// The hooks against the engine: with no run, the mod stays out of the person's way.

test('the deny-list never touches a call from the main session', async ($, on) => {
  on('tool.call', () => ({ result: 'ran' }))
  const pushed = await $.tool.call({ tool: 'Bash', command: 'git push origin HEAD', description: 'push' })
  expect(pushed.deny).toBeUndefined()
  expect(pushed.result).toBe('ran')
})

test('the report tool refuses anyone but the mod\'s own agents', async $ => {
  const reported = await $.tool.call({ tool: 'mcp__orchestrator__report', kind: 'dev', committed: true })
  expect(reported.result).toBe('Only orchestrator agents report here.')
})

test('status with no run says so', async $ => {
  const status = await $.tool.call({ tool: 'mcp__orchestrator__status' })
  expect(status.result).toBe('No orchestrator run.')
})
