import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

// Housekeeping's empty folders: after the worktree goes, the folder git could not delete and
// the parents its branch name made are removed while empty, up to but never including the
// repo. Git answers from a script, the disk from `folders`; every command run is recorded.

const BRANCH = 'fix/RVR/x'
const PATH = 'D:/r/fix/RVR/x'

type Disk = Record<string, string[]>

function stub(on: On, ran: string[], disk: Disk, remove: { exitCode: number; stderr: string; isStillListed: boolean }) {
  let isRemoved = false
  const listing = () =>
    'worktree D:/r/.bare\nbare\n\nworktree D:/r/main\nHEAD a\nbranch refs/heads/main\n\n' +
    (isRemoved && !remove.isStillListed ? '' : `worktree ${PATH}\nHEAD abc\nbranch refs/heads/${BRANCH}\n`)

  on('session.cwd', () => ({ value: 'D:/r/main' }))
  on('ui.toast', () => ({ value: undefined }))
  // The engine hands fs paths over in the platform's own spelling.
  on('fs.exists', ($, e) => ({ value: e.path.replace(/\\/g, '/') in disk }))
  on('fs.list', ($, e) => {
    const entries = disk[e.path.replace(/\\/g, '/')]
    if (entries === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: entries.map(name => ({ name, kind: 'directory', size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('process.run', ($, e) => {
    const line = e.argv.join(' ')
    ran.push(line)
    const answer = (stdout: string, exitCode = 0, stderr = '') => ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } })

    if (/--git-common-dir/.test(line)) return answer('D:/r/.bare\n')
    if (/worktree list --porcelain/.test(line)) return answer(listing())
    if (/config --get-regexp/.test(line)) return answer(`branch.${BRANCH}.lifecycleowner worktree-lifecycle\nbranch.${BRANCH}.lifecyclebase main\n`)
    if (/rev-parse --verify --quiet refs\/heads\//.test(line)) return answer('abc\n')
    if (/^gh pr list/.test(line)) return answer('[]')
    if (/worktree remove/.test(line)) {
      isRemoved = true
      if (remove.exitCode === 0) delete disk[PATH]
      return answer('', remove.exitCode, remove.stderr)
    }
    if (line.startsWith('cmd /c rmdir ')) {
      const target = line.slice('cmd /c rmdir '.length).replace(/\\/g, '/')
      if ((disk[target] ?? ['x']).length > 0 || target === held) return answer('', 1, 'The process cannot access the file because it is being used by another process.')
      delete disk[target]
      return answer('')
    }

    return answer('')
  })
}

let held = ''

const clean = ($: Parameters<Parameters<typeof test>[1]>[0]) =>
  $.command.run({ command: 'wt', args: `clean ${BRANCH}`, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

const rmdirs = (ran: string[]) => ran.filter(line => line.startsWith('cmd /c rmdir ')).map(line => line.slice('cmd /c rmdir '.length))

test('empty parents go up to the first folder that still holds something', async ($, on) => {
  const ran: string[] = []
  held = ''
  const disk: Disk = { [PATH]: [], 'D:/r/fix/RVR': [], 'D:/r/fix': ['RVR', 'OTHER'], 'D:/r': ['.bare', 'fix', 'main'] }
  stub(on, ran, disk, { exitCode: 0, stderr: '', isStillListed: false })

  const result = await clean($)

  expect(rmdirs(ran)).toEqual(['D:\\r\\fix\\RVR'])
  expect(ran).toContain('git -C D:/r fetch --no-prune origin main')
  expect(disk['D:/r/fix']).toEqual(['RVR', 'OTHER'])
  expect(result.text).toMatch(/removed the empty folder D:\/r\/fix\/RVR/)
})

test('a worktree folder git deregistered but could not delete is removed, then its empty parents', async ($, on) => {
  const ran: string[] = []
  held = ''
  const disk: Disk = { [PATH]: [], 'D:/r/fix/RVR': [], 'D:/r/fix': [], 'D:/r': ['.bare', 'fix', 'main'] }
  stub(on, ran, disk, { exitCode: 255, stderr: `error: failed to delete '${PATH}': Permission denied`, isStillListed: false })

  const result = await clean($)

  expect(rmdirs(ran)).toEqual(['D:\\r\\fix\\RVR\\x', 'D:\\r\\fix\\RVR', 'D:\\r\\fix'])
  expect(ran).toContain(`git -C D:/r branch -d ${BRANCH}`)
  expect(result.text).toMatch(/Housekept/)
})

test('a folder still held is left behind and said, and the branch still goes', async ($, on) => {
  const ran: string[] = []
  held = 'D:/r/fix/RVR/x'
  const disk: Disk = { [PATH]: [], 'D:/r/fix/RVR': [], 'D:/r/fix': [], 'D:/r': ['.bare', 'fix', 'main'] }
  stub(on, ran, disk, { exitCode: 255, stderr: `error: failed to delete '${PATH}': Permission denied`, isStillListed: false })

  const result = await clean($)

  expect(rmdirs(ran)).toEqual(['D:\\r\\fix\\RVR\\x'])
  expect(ran).toContain(`git -C D:/r branch -d ${BRANCH}`)
  expect(result.text).toMatch(/left D:\/r\/fix\/RVR\/x behind/)
})

test('a worktree git still lists is not removed around: the branch is kept', async ($, on) => {
  const ran: string[] = []
  held = ''
  const disk: Disk = { [PATH]: ['src'], 'D:/r/fix/RVR': ['x'], 'D:/r/fix': ['RVR'], 'D:/r': ['.bare', 'fix', 'main'] }
  stub(on, ran, disk, { exitCode: 128, stderr: "fatal: 'D:/r/fix/RVR/x' contains modified or untracked files", isStillListed: true })

  const result = await clean($)

  expect(rmdirs(ran)).toEqual([])
  expect(ran.some(line => / branch -d /.test(line))).toBe(false)
  expect(result.text).toMatch(/worktree remove failed/)
})
