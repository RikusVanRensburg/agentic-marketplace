import { expect, test } from 'claude-code/testing'

import type { Effect, RunState } from '../hooks/engine'
import { inFlight, start, step } from '../hooks/engine'
import type { Ran, Run } from '../hooks/git'
import { createSlice, devState, integrate, parseWorktrees, removeSlice } from '../hooks/git'
import { denyOf, shellDeny } from '../hooks/guards'
import { SYSTEM, taskOf, trailerOf, typeName } from '../hooks/prompts'

import { config, plan } from './fixture'

const WT = 'D:/src/flow/timebase/feat/RVR/orchestration/payments/107-core-dto'

test('the deny-list refuses pushes, tracker writes, branch and worktree changes, and stashes', () => {
  for (const command of [
    'git push origin HEAD',
    'git -C . push --dry-run',
    'gh issue close 107',
    'gh pr create --fill',
    'gh issue comment 107 --body x',
    'gh api repos/o/r/issues/107 -X PATCH -f state=closed',
    'git branch -D feat/x',
    'git worktree remove ../x',
    'git checkout main',
    'git checkout -b side',
    'git switch -c other',
    'git stash',
    'git reset --hard origin/main',
    'git rebase -i HEAD~2',
  ]) {
    expect({ command, why: shellDeny(command, WT) }).toMatchObject({ why: expect.any(String) })
  }
})

test('the deny-list lets ordinary work through', () => {
  for (const command of ['dotnet test', 'git status', 'git add -A && git commit -m "feat: x"', 'git diff HEAD~1', 'git checkout -- src/a.cs', 'git checkout --theirs calc.py', 'git checkout --ours -- calc.py', 'git reset --hard HEAD', 'gh issue view 107 --comments', 'gh api repos/o/r/issues/107/comments', 'gh pr view 3']) {
    expect({ command, why: shellDeny(command, WT) }).toEqual({ command, why: null })
  }
})

test('an agent stays in its worktree, for the shell and for file edits', () => {
  expect(shellDeny('cd D:/src/flow/other && ls', WT)).toMatch(/outside your worktree/)
  expect(shellDeny(`cd "${WT}/src" && dotnet build`, WT)).toBeNull()
  expect(shellDeny('git -C D:\\src\\flow\\timebase\\dev log', WT)).toMatch(/outside/)
  expect(denyOf('Edit', { file_path: 'D:\\src\\flow\\timebase\\dev\\a.cs' }, WT)).toMatch(/outside/)
  expect(denyOf('Write', { file_path: `${WT}/src/a.cs` }, WT)).toBeNull()
  expect(denyOf('Read', { file_path: 'C:/anything' }, WT)).toBeNull()
})

// A pretend git: answers by the joined argv, records every call.
function fakeGit(table: [RegExp, Partial<Ran>][]) {
  const calls: string[] = []
  const run: Run = async argv => {
    const line = argv.join(' ')
    calls.push(line)
    const hit = table.find(([pattern]) => pattern.test(line))
    return { exitCode: 0, stdout: '', stderr: '', ...(hit?.[1] ?? {}) }
  }
  return { run, calls }
}

test('a slice worktree is cut from the integration branch at <repo>/<branch>', async () => {
  const git = fakeGit([
    [/worktree list/, { stdout: 'worktree D:/r/.bare\nbare\n\nworktree D:/r/feat/RVR/payments\nbranch refs/heads/feat/RVR/payments\n' }],
    [/rev-parse --verify --quiet feat\/RVR\/payments/, { stdout: 'abc123\n' }],
    [/rev-parse --verify --quiet refs\/heads\//, { exitCode: 1 }],
  ])
  const made = await createSlice(git.run, 'D:/r', 'feat/RVR/orchestration/payments/107-core-dto', 'feat/RVR/payments')
  expect(made).toEqual({ isDone: true, path: 'D:/r/feat/RVR/orchestration/payments/107-core-dto', baseSha: 'abc123' })
  expect(git.calls).toContain('git -C D:/r worktree add -b feat/RVR/orchestration/payments/107-core-dto D:/r/feat/RVR/orchestration/payments/107-core-dto abc123')
})

test('dev state reads a clean, advanced tree', async () => {
  const git = fakeGit([[/rev-list --count/, { stdout: '2\n' }]])
  expect(await devState(git.run, WT, 'b0')).toEqual({ isClean: true, isAdvanced: true })
  const dirty = fakeGit([[/status --porcelain/, { stdout: ' M a.cs\n' }], [/rev-list --count/, { stdout: '0\n' }]])
  expect(await devState(dirty.run, WT, 'b0')).toEqual({ isClean: false, isAdvanced: false })
})

test('a conflicting merge aborts and names the files; it never resolves', async () => {
  const git = fakeGit([
    [/rev-parse --verify --quiet HEAD/, { stdout: 'before\n' }],
    [/rev-parse --verify --quiet feat/, { stdout: 'tip\n' }],
    [/merge-base --is-ancestor/, { exitCode: 1 }],
    [/merge --no-ff/, { exitCode: 1, stderr: 'CONFLICT' }],
    [/diff --name-only --diff-filter=U/, { stdout: 'src/a.cs\nsrc/b.cs\n' }],
  ])
  const shell = async () => ({ exitCode: 0, tail: '' })
  const merge = await integrate(git.run, shell, 'D:/r/i', 'feat/x', 'Merge feat/x', { build: 'b', test: 't' })
  expect(merge).toEqual({ isMerged: false, conflicts: ['src/a.cs', 'src/b.cs'] })
  expect(git.calls).toContain('git merge --abort')
  expect(git.calls).toContain('git reset --hard before')
})

test('a red suite after a clean merge resets to the HEAD before it', async () => {
  const git = fakeGit([
    [/rev-parse --verify --quiet HEAD/, { stdout: 'before\n' }],
    [/rev-parse --verify --quiet feat/, { stdout: 'tip\n' }],
    [/merge-base --is-ancestor/, { exitCode: 1 }],
  ])
  const shell = async (command: string) => ({ exitCode: command === 't' ? 1 : 0, tail: '3 failed' })
  const merge = await integrate(git.run, shell, 'D:/r/i', 'feat/x', 'Merge feat/x', { build: 'b', test: 't' })
  expect(merge).toEqual({ isMerged: false, failure: 'test exited 1: 3 failed' })
  expect(git.calls).toContain('git reset --hard before')
})

test('a branch already merged by an earlier attempt counts as merged without merging again', async () => {
  const git = fakeGit([[/rev-parse --verify --quiet/, { stdout: 'sha\n' }]])
  const merge = await integrate(git.run, async () => ({ exitCode: 0, tail: '' }), 'D:/r/i', 'feat/x', 'm', { build: 'b', test: 't' })
  expect(merge).toEqual({ isMerged: true, commit: 'sha' })
  expect(git.calls.some(c => c.includes('merge --no-ff'))).toBe(false)
})

test('worktree porcelain parses paths and branches', () => {
  expect(parseWorktrees('worktree D:\\r\\.bare\r\nbare\r\n\r\nworktree D:/r/dev\r\nHEAD abc\r\nbranch refs/heads/dev\r\n')).toEqual([
    { path: 'D:/r/.bare', branch: null },
    { path: 'D:/r/dev', branch: 'dev' },
  ])
})

function running(): RunState {
  let s = start(plan(), config, { completed: [], other: [] }, 'run1', 0).state
  s = step(s, { kind: 'integration-ready', repo: 'timebase', path: 'D:/r/i' }, 1).state
  s = step(s, { kind: 'slice-ready', slice: '107', path: WT, baseSha: 'b0' }, 1).state
  return s
}

test('QA is told the slice and nothing about how it was built', () => {
  let s = running()
  s.slices['107']!.defects = ['an earlier defect']
  s.handoff['999'] = 'a handoff note'
  s.slices['107']!.dev = { kind: 'dev', committed: true, summary: 'DEV SELF REPORT' }
  const qa = taskOf(s, 'qa', 'timebase', '107', 1, config.qa)
  expect(qa).toMatch(/issues\/107/)
  expect(qa).not.toMatch(/DEV SELF REPORT|an earlier defect|handoff|Co-Authored-By/)

  const dev = taskOf(s, 'dev', 'timebase', '107', 2, config.ladders['haiku-first'][1]!)
  expect(dev).toMatch(/Goal: Add the payment DTO\./)
  expect(dev).toMatch(/an earlier defect/)
  expect(dev).toMatch(/Co-Authored-By: Claude Sonnet \(sonnet, high effort, orchestrator dev round 2\)/)
})

test('agent type names carry role, model and effort', () => {
  expect(typeName('dev', { model: 'claude-sonnet-5-5', effort: 'xhigh' })).toBe('dev-claude-sonnet-5-5-xhigh')
  expect(trailerOf({ model: 'opus', effort: 'high' }, 'remediate', 1)).toBe('Co-Authored-By: Claude Opus (opus, high effort, orchestrator remediate round 1) <noreply@anthropic.com>')
})

test('an answered blocker resumes the slice on the rung it stopped on, with the answer, and releases its chain', () => {
  let s = running()
  // Exhaust the haiku-first ladder on 107.
  for (let round = 1; round <= 3; round++) {
    const devKey = Object.keys(s.agents)[0]!
    s = step(s, { kind: 'spawned', key: devKey, agentId: `d${round}` }, 1).state
    s = step(s, { kind: 'report', agentId: `d${round}`, report: { kind: 'dev', committed: true, summary: 'x' } }, 1).state
    s = step(s, { kind: 'ended', agentId: `d${round}`, reason: 'answer' }, 1).state
    s = step(s, { kind: 'dev-checked', slice: '107', isClean: true, isAdvanced: true }, 1).state
    const qaKey = Object.values(s.agents).find(a => a.role === 'qa')!.key
    s = step(s, { kind: 'spawned', key: qaKey, agentId: `q${round}` }, 1).state
    s = step(s, { kind: 'report', agentId: `q${round}`, report: { kind: 'qa', pass: false, defects: ['nope'] } }, 1).state
    s = step(s, { kind: 'ended', agentId: `q${round}`, reason: 'answer' }, 1).state
  }
  expect(s.slices['107']!.phase).toBe('blocked')
  expect(s.slices['108']!.phase).toBe('halted')

  const { state, effects } = step(s, { kind: 'retry', at: '107', answer: 'use decimal, not double' }, 2)
  expect(state.slices['107']).toMatchObject({ phase: 'dev', round: 3, answer: 'use decimal, not double' })
  expect(state.slices['108']!.phase).toBe('waiting')
  expect(effects.find(e => e.kind === 'spawn')).toMatchObject({ role: 'dev', round: 3, rung: { model: 'opus' } })
  expect(taskOf(state, 'dev', 'timebase', '107', 3, config.ladders['haiku-first'][2]!)).toMatch(/answered the blocker on this slice: use decimal/)
})

test('a slice blocked at integration goes back to the queue on retry', () => {
  let s = running()
  s.slices['107']!.phase = 'integrating'
  s.integrating = '107'
  s = step(s, { kind: 'integrated', slice: '107', isMerged: false, failure: 'flaky' }, 1).state
  const { state, effects } = step(s, { kind: 'retry', at: '107', answer: 'it was a flaky test, merge again' }, 2)
  expect(effects).toContainEqual({ kind: 'integrate', slice: '107' })
  expect(state.slices['107']!.phase).toBe('integrating')
})

test('after a reload, the effects that were running go again', () => {
  const s = running()
  s.slices['109']!.phase = 'starting'
  s.slices['107']!.phase = 'checking'
  const effects: Effect[] = inFlight(s)
  expect(effects).toEqual([
    { kind: 'check-dev', slice: '107' },
    { kind: 'create-slice', slice: '109' },
  ])
})

test('a slice whose QA could not start resumes QA on retry, keeping the dev commit', () => {
  let s = running()
  const devKey = Object.keys(s.agents)[0]!
  s = step(s, { kind: 'spawned', key: devKey, agentId: 'd1' }, 1).state
  s = step(s, { kind: 'report', agentId: 'd1', report: { kind: 'dev', committed: true, summary: 'x' } }, 1).state
  s = step(s, { kind: 'ended', agentId: 'd1', reason: 'answer' }, 1).state
  s = step(s, { kind: 'dev-checked', slice: '107', isClean: true, isAdvanced: true }, 1).state
  for (const n of [1, 2]) {
    const qaKey = Object.values(s.agents).find(a => a.role === 'qa')!.key
    s = step(s, { kind: 'spawn-failed', key: qaKey, reason: `refused ${n}` }, 1).state
  }
  expect(s.slices['107']).toMatchObject({ phase: 'blocked', stoppedIn: 'qa', stoppedOnInfra: true })

  const { state, effects } = step(s, { kind: 'retry', at: '107', answer: 'approval fixed' }, 2)
  expect(state.slices['107']!.phase).toBe('qa')
  expect(effects.find(e => e.kind === 'spawn')).toMatchObject({ role: 'qa', round: 1 })
})

test('a merged slice loses its worktree and branch; one not in the integration branch keeps both', async () => {
  const git = fakeGit([])
  expect(await removeSlice(git.run, 'D:/r', 'D:/r/feat/x', 'feat/x', 'feat/RVR/smoke')).toEqual({ isDone: true })
  expect(git.calls).toEqual([
    'git -C D:/r merge-base --is-ancestor refs/heads/feat/x refs/heads/feat/RVR/smoke',
    'git -C D:/r worktree remove --force D:/r/feat/x',
    'git -C D:/r branch -D feat/x',
  ])
  const unmerged = fakeGit([[/merge-base --is-ancestor/, { exitCode: 1 }]])
  expect(await removeSlice(unmerged.run, 'D:/r', 'D:/r/feat/x', 'feat/x', 'feat/RVR/smoke')).toMatchObject({ isDone: false })
  expect(unmerged.calls).toHaveLength(1)
})

test('QA is told history is not evidence, and an answer never overrides criteria', () => {
  const s = running()
  s.slices['107']!.answer = 'just make it pass'
  expect(SYSTEM.qa).toMatch(/claims, not evidence/)
  expect(SYSTEM['final-qa']).toMatch(/claims, not evidence/)
  expect(taskOf(s, 'dev', 'timebase', '107', 1, config.ladders['haiku-first'][0]!)).toMatch(/never overrides any slice's acceptance criteria/)
})
