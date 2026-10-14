import { expect, test } from 'claude-code/testing'

// Every fetch the mod runs keeps remote-tracking refs: with `fetch.prune` set, a plain fetch
// deletes origin/<branch> for branches the remote dropped, and `branch -d` then refuses a
// squash-merged branch that is not in HEAD. Git answers from a script; every command is kept.

test('creating a worktree fetches without pruning', async ($, on) => {
  const ran: string[] = []

  on('session.cwd', () => ({ value: 'D:/r/main' }))
  on('fs.exists', () => ({ value: false }))
  on('process.run', ($, e) => {
    const line = e.argv.join(' ')
    ran.push(line)
    const answer = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

    if (/--git-dir --git-common-dir/.test(line)) return answer('D:/r/.bare/worktrees/main\nD:/r/.bare\n')
    if (/--git-common-dir/.test(line)) return answer('D:/r/.bare\n')
    if (/symbolic-ref --quiet --short HEAD/.test(line)) return answer('main\n')
    if (/config user\.name/.test(line)) return answer('Rikus van Rensburg\n')

    return answer('')
  })

  const result = await $.command.run({ command: 'wt', args: 'new fix tidy', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  const fetches = ran.filter(line => / fetch /.test(line))

  expect(result.text).toMatch(/Created fix\/RVR\/tidy/)
  expect(fetches.length).toBeGreaterThan(0)
  expect(fetches.every(line => line.includes(' fetch --no-prune '))).toBe(true)
})
