import { expect, test } from 'claude-code/testing'

import type { Ran, Run } from '../hooks/git'
import { checkMerge } from '../hooks/git'

// A scripted repo: before h0, the merge agent merged s1 (tip t1) as m1, giving h1. Each case
// changes one answer from what a clean batch gives.
type Repo = {
  head: string
  ancestors: [string, string][]
  dirty: string
  stray: string
  merges: string
  redone: { exitCode: number; tree: string }
}

const CLEAN: Repo = {
  head: 'h1',
  ancestors: [['h0', 'h1'], ['t1', 'h1']],
  dirty: '',
  stray: '',
  merges: 'm1 h0 t1\n',
  redone: { exitCode: 0, tree: 'T1' },
}

function git(repo: Partial<Repo> = {}) {
  const r = { ...CLEAN, ...repo }
  const calls: string[] = []
  const ok = (stdout = ''): Ran => ({ exitCode: 0, stdout, stderr: '' })
  const run: Run = async argv => {
    const a = [...argv]
    calls.push(a.join(' '))
    if (a[1] === 'rev-parse' && a.includes('HEAD^{commit}')) return ok(`${r.head}\n`)
    if (a[1] === 'rev-parse' && a.includes('refs/heads/s1^{commit}')) return ok('t1\n')
    if (a[1] === 'rev-parse' && a.includes('refs/heads/s2^{commit}')) return ok('t2\n')
    if (a[1] === 'rev-parse' && a[2] === 'm1^{tree}') return ok('T1\n')
    if (a[1] === 'merge-base') return { exitCode: r.ancestors.some(([x, y]) => x === a[3] && y === a[4]) ? 0 : 1, stdout: '', stderr: '' }
    if (a[1] === 'status') return ok(r.dirty)
    if (a[1] === 'rev-list') return ok(r.stray)
    if (a[1] === 'log') return ok(r.merges)
    if (a[1] === 'merge-tree') return { exitCode: r.redone.exitCode, stdout: `${r.redone.tree}\n`, stderr: '' }
    return { exitCode: 1, stdout: '', stderr: `unexpected ${a.join(' ')}` }
  }
  return { run, calls }
}

test('a batch of clean merges checks out and names each merge commit', async () => {
  const g = git()
  expect(await checkMerge(g.run, 'D:/r/i', 'h0', ['s1'], [])).toEqual({ problem: null, commits: { s1: 'm1' } })
  expect(g.calls).toContain('git rev-list --no-merges h1 ^h0 ^t1')
  expect(g.calls).toContain('git merge-tree --write-tree h0 t1')
})

test('a merge that is not what git makes by itself is refused: a resolved conflict or an edit', async () => {
  for (const redone of [{ exitCode: 1, tree: 'T1' }, { exitCode: 0, tree: 'OTHER' }]) {
    expect((await checkMerge(git({ redone }).run, 'D:/r/i', 'h0', ['s1'], [])).problem).toMatch(/not the merge git makes by itself/)
  }
})

test('a commit other than a merge on the integration branch is refused', async () => {
  expect((await checkMerge(git({ stray: 'f00\n' }).run, 'D:/r/i', 'h0', ['s1'], [])).problem).toMatch(/commits other than merges landed: f00/)
})

test('the report has to match the branch: merged means in HEAD, not merged means out', async () => {
  expect((await checkMerge(git({ ancestors: [['h0', 'h1']] }).run, 'D:/r/i', 'h0', ['s1'], [])).problem).toMatch(/s1 is reported merged but is not in HEAD/)
  const both = git({ ancestors: [['h0', 'h1'], ['t1', 'h1'], ['t2', 'h1']] })
  expect((await checkMerge(both.run, 'D:/r/i', 'h0', ['s1'], ['s2'])).problem).toMatch(/s2 is reported not merged but is in HEAD/)
})

test('HEAD has to grow from the batch start, with a clean tree', async () => {
  expect((await checkMerge(git({ ancestors: [['t1', 'h1']] }).run, 'D:/r/i', 'h0', ['s1'], [])).problem).toMatch(/does not grow from h0/)
  expect((await checkMerge(git({ dirty: ' M src/a.cs\n' }).run, 'D:/r/i', 'h0', ['s1'], [])).problem).toMatch(/uncommitted changes: M src\/a.cs/)
  expect((await checkMerge(git().run, 'D:/r/i', '', ['s1'], [])).problem).toMatch(/no HEAD was recorded/)
})

test('a baseline check with nothing merged checks out when HEAD did not move', async () => {
  const g = git({ head: 'h0', ancestors: [], merges: '' })
  expect(await checkMerge(g.run, 'D:/r/i', 'h0', [], [])).toEqual({ problem: null, commits: {} })
})
