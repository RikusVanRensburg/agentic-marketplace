import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

// The guards against a pretend bare repo at D:/r: git answers from the table below, and a
// tool call that gets past every guard is answered `ran` by the test itself.

const REFS = new Set(['refs/heads/main', 'refs/heads/feat/RVR/x', 'refs/remotes/origin/main'])

function stub(on: On, cwd = 'D:/r/main', isBare = true) {
  on('session.cwd', () => ({ value: cwd }))
  on('process.run', ($, e) => {
    const argv = e.argv.join(' ')
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const no = { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }

    if (argv.includes('--git-common-dir')) return ok(isBare ? 'D:/r/.bare\n' : 'D:/c/.git\n')
    if (argv.includes('rev-parse --verify --quiet')) return REFS.has(e.argv[e.argv.length - 1] ?? '') ? ok('abc\n') : no

    return no
  })
  on('tool.call', () => ({ result: 'ran' }))
}

const bash = (command: string) => ({ tool: 'Bash', command, description: 'test' }) as const

function refusal(result: { deny?: string; isError?: boolean; text?: string }): string | undefined {
  return result.deny ?? (result.isError === true ? result.text : undefined)
}

test('EnterWorktree is refused', async ($, on) => {
  stub(on)
  const result = await $.tool.call({ tool: 'EnterWorktree' })

  expect(refusal(result)).toMatch(/EnterWorktree/)
})

test('a bare stash and a pop are refused, a tagged stash runs', async ($, on) => {
  stub(on)

  expect(refusal(await $.tool.call(bash('git stash')))).toMatch(/shared across worktrees/)
  expect(refusal(await $.tool.call(bash('git status && git stash pop')))).toMatch(/git stash apply/)
  expect(refusal(await $.tool.call({ tool: 'PowerShell', command: 'git stash' }))).toMatch(/shared/)
  expect(refusal(await $.tool.call(bash('git stash push -u -m "rvr-wip-1"')))).toBeUndefined()
})

test('worktree add runs only at <repo>/<branch>', async ($, on) => {
  stub(on)

  expect(refusal(await $.tool.call(bash('git -C D:/r worktree add D:/r/feat/RVR/y -b feat/RVR/y main')))).toBeUndefined()
  expect(refusal(await $.tool.call(bash('git worktree add ../feat/RVR/y -b feat/RVR/y main')))).toBeUndefined()
  expect(refusal(await $.tool.call(bash('git worktree add D:/r/feat/RVR/x feat/RVR/x')))).toBeUndefined()
  expect(refusal(await $.tool.call(bash('git worktree add ../y -b feat/RVR/y main')))).toMatch(/D:\/r\/feat\/RVR\/y/)
  expect(refusal(await $.tool.call(bash('git worktree add .claude/worktrees/x -b feat/RVR/y')))).toMatch(/<repo>\/<branch>/)
  expect(refusal(await $.tool.call(bash('git worktree add --detach D:/r/tmp abc123')))).toMatch(/needs a branch/)
})

test('orchestration branches pass when they follow the layout', async ($, on) => {
  stub(on)
  const command = 'git -C D:/r worktree add D:/r/feat/RVR/orchestration/x/slice-1 -b feat/RVR/orchestration/x/slice-1 feat/RVR/x'

  expect(refusal(await $.tool.call(bash(command)))).toBeUndefined()
})

test('a normal clone is left alone', async ($, on) => {
  stub(on, 'D:/c', false)

  expect(refusal(await $.tool.call(bash('git stash')))).toBeUndefined()
  expect(refusal(await $.tool.call(bash('git worktree add ../elsewhere')))).toBeUndefined()
})
