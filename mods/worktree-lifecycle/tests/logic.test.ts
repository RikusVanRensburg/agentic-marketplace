import { expect, test } from 'claude-code/testing'

import { parseLifecycleKeys, parseWorktrees } from '../hooks/git'
import { gitCalls, segmentsOf, stashVerdict, worktreeAddOf } from '../hooks/guards'
import { isInside, join, normalize, samePath } from '../hooks/paths'
import { FALLBACK_RULE, clashOf, initialsOf, isReserved, isSlug, mentionsBranchNaming, patternsInWorkflow, ruleFromAnswer } from '../hooks/rules'

const CI = `
jobs:
  check-branch-name:
    steps:
      - run: |
          BRANCH="\${{ github.head_ref }}"
          PATTERN='^(feat|fix|docs|chore|refactor|test)/[A-Za-z]{2,4}/[A-Za-z0-9].+'
          if [[ ! "$BRANCH" =~ $PATTERN ]]; then exit 1; fi
`

test('a CI branch check gives its pattern, and a workflow about something else gives none', () => {
  expect(patternsInWorkflow(CI)).toEqual(['^(feat|fix|docs|chore|refactor|test)/[A-Za-z]{2,4}/[A-Za-z0-9].+'])
  expect(patternsInWorkflow("run: grep '^foo' file.txt")).toEqual([])
})

test('the fallback rule takes <type>/<initials>/<description> and nothing else', () => {
  const rule = new RegExp(FALLBACK_RULE.pattern)

  expect(rule.test('feat/RVR/tree-pane')).toBe(true)
  expect(rule.test('RVR/Feat/tree-design')).toBe(false)
  expect(rule.test('feat/RVR-tree-pane')).toBe(false)
  expect(rule.test('feature/RVR/x')).toBe(false)
})

test('a model answer becomes a rule only when it is one compiling pattern', () => {
  expect(ruleFromAnswer('^(feat|fix)/[A-Z]+/.+$')).toBe('^(feat|fix)/[A-Z]+/.+$')
  expect(ruleFromAnswer('`^feat/.+$`')).toBe('^feat/.+$')
  expect(ruleFromAnswer('/^fix\\/.+$/')).toBe('^fix\\/.+$')
  expect(ruleFromAnswer('NONE')).toBeNull()
  expect(ruleFromAnswer('^(unclosed')).toBeNull()
  expect(ruleFromAnswer(null)).toBeNull()
})

test('prose is only sent to a model when it talks about branch names', () => {
  expect(mentionsBranchNaming('Branch names are type/initials/description.')).toBe(true)
  expect(mentionsBranchNaming('We use the naming convention for branches below.')).toBe(true)
  expect(mentionsBranchNaming('Install the plugin from the main branch.')).toBe(false)
})

test('initials come from the name, slugs are kebab case', () => {
  expect(initialsOf('Rikus van Rensburg')).toBe('RVR')
  expect(initialsOf('Cher')).toBeNull()
  expect(isSlug('tree-pane')).toBe(true)
  expect(isSlug('Tree_Pane')).toBe(false)
})

test('orchestration branches are reserved, and a/b clashes with a/b/c either way', () => {
  expect(isReserved('feat/RVR/orchestration/x/slice-1')).toBe(true)
  expect(isReserved('feat/RVR/orchestration-notes')).toBe(false)
  expect(clashOf('feat/RVR/x', ['feat/RVR/x/y'])).toBe('feat/RVR/x/y')
  expect(clashOf('feat/RVR/x/y', ['feat/RVR/x'])).toBe('feat/RVR/x')
  expect(clashOf('feat/RVR/x', ['feat/RVR/xy'])).toBeNull()
})

test('worktree list and lifecycle keys parse as git prints them', () => {
  const rows = parseWorktrees(
    'worktree D:/r/.bare\nbare\n\nworktree D:/r/main\nHEAD abc\nbranch refs/heads/main\n\nworktree D:/r/feat/RVR/x\nHEAD def\nbranch refs/heads/feat/RVR/x\nprunable gitdir file points to non-existent location\n',
  )

  expect(rows.map(row => [row.path, row.branch, row.isBare, row.isPrunable])).toEqual([
    ['D:/r/.bare', null, true, false],
    ['D:/r/main', 'main', false, false],
    ['D:/r/feat/RVR/x', 'feat/RVR/x', false, true],
  ])

  const keys = parseLifecycleKeys('branch.feat/RVR/x.y.lifecycleowner worktree-lifecycle\nbranch.feat/RVR/x.y.lifecyclebase main\nbranch.feat/RVR/x.y.lifecyclenotified true\n')
  expect(keys.get('feat/RVR/x.y')).toEqual({ owner: 'worktree-lifecycle', base: 'main', isNotified: true })
})

test('Windows paths compare however the shell spelled them', () => {
  expect(normalize('/d/src/flow', true)).toBe('D:/src/flow')
  expect(normalize('d:\\src\\flow\\', true)).toBe('D:/src/flow')
  expect(normalize('/d/src', false)).toBe('/d/src')
  expect(join('D:/src/repo/main', '../feat/RVR/x', true)).toBe('D:/src/repo/feat/RVR/x')
  expect(samePath('/d/src/Repo/feat/x', 'D:\\src\\repo\\feat\\x', true)).toBe(true)
  expect(isInside('D:/src/repo/feat/x/sub', 'd:/src/repo/feat/x', true)).toBe(true)
  expect(isInside('D:/src/repo/feat/xy', 'D:/src/repo/feat/x', true)).toBe(false)
})

test('commands split at separators outside quotes and follow cd and -C', () => {
  expect(segmentsOf('git commit -m "a; b" && git push')).toEqual([['git', 'commit', '-m', 'a; b'], ['git', 'push']])

  const calls = gitCalls('cd /d/src/repo && git -C main worktree add ../feat/RVR/x -b feat/RVR/x main', 'D:/elsewhere', true)
  expect(calls).toEqual([{ cwd: 'D:/src/repo/main', args: ['worktree', 'add', '../feat/RVR/x', '-b', 'feat/RVR/x', 'main'] }])

  expect(gitCalls('& "C:\\Program Files\\Git\\cmd\\git.exe" stash', 'D:/r', true)[0]?.args).toEqual(['stash'])
})

test('a bare stash, an untagged push and any pop are refused; tagged pushes and apply are not', () => {
  expect(stashVerdict([])).not.toBeNull()
  expect(stashVerdict(['-u'])).not.toBeNull()
  expect(stashVerdict(['push'])).not.toBeNull()
  expect(stashVerdict(['save', 'wip'])).not.toBeNull()
  expect(stashVerdict(['pop'])).not.toBeNull()
  expect(stashVerdict(['pop', 'stash@{0}'])).not.toBeNull()
  expect(stashVerdict(['push', '-u', '-m', 'mine'])).toBeNull()
  expect(stashVerdict(['-m', 'mine'])).toBeNull()
  expect(stashVerdict(['apply', 'abc123'])).toBeNull()
  expect(stashVerdict(['list'])).toBeNull()
})

test('worktree add is read for its path, new branch and commit', () => {
  expect(worktreeAddOf(['worktree', 'add', '--lock', '--reason', 'x', 'p', '-b', 'b', 'main'])).toEqual({ path: 'p', newBranch: 'b', commitish: 'main', isDetached: false })
  expect(worktreeAddOf(['worktree', 'add', '--detach', 'p', 'abc'])).toEqual({ path: 'p', newBranch: null, commitish: 'abc', isDetached: true })
  expect(worktreeAddOf(['worktree', 'list'])).toBeNull()
})
