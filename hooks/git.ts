// Git and the repo's own build and test commands, run by the mod itself. Every function here
// is safe to call twice: a reload can re-issue an effect that already half ran.

export type Ran = { exitCode: number; stdout: string; stderr: string }

export type Run = (argv: readonly string[], options?: { cwd?: string; stdin?: string; timeoutMs?: number }) => Promise<Ran>

// Runs one shell command line to completion with no time cap, answering its exit code and the
// tail of what it wrote.
export type Shell = (command: string, cwd: string) => Promise<{ exitCode: number; tail: string }>

export type Outcome<T> = ({ isDone: true } & T) | { isDone: false; reason: string }

const slashed = (path: string) => path.trim().replace(/\\/g, '/').replace(/\/$/, '')

const same = (a: string, b: string) => slashed(a).toLowerCase() === slashed(b).toLowerCase()

export type WorktreeRow = { path: string; branch: string | null }

export function parseWorktrees(porcelain: string): WorktreeRow[] {
  return porcelain
    .replace(/\r/g, '')
    .split(/\n\n+/)
    .map(block => {
      const row: WorktreeRow = { path: '', branch: null }
      for (const line of block.split('\n')) {
        if (line.startsWith('worktree ')) row.path = slashed(line.slice(9))
        else if (line.startsWith('branch ')) row.branch = line.slice(7).replace(/^refs\/heads\//, '')
      }
      return row
    })
    .filter(row => row.path)
}

export async function worktrees(run: Run, root: string): Promise<WorktreeRow[]> {
  const listed = await run(['git', '-C', root, 'worktree', 'list', '--porcelain'])
  return listed.exitCode === 0 ? parseWorktrees(listed.stdout) : []
}

export async function headOf(run: Run, cwd: string, ref = 'HEAD'): Promise<string | null> {
  const head = await run(['git', 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd })
  return head.exitCode === 0 ? head.stdout.trim() : null
}

const hasBranch = async (run: Run, root: string, branch: string) =>
  (await run(['git', '-C', root, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])).exitCode === 0

// A slice worktree at `<root>/<branch>`, cut from the integration branch's HEAD. Reused when it
// is already there from an earlier attempt.
export async function createSlice(run: Run, root: string, branch: string, startPoint: string): Promise<Outcome<{ path: string; baseSha: string }>> {
  const path = `${slashed(root)}/${branch}`
  const existing = (await worktrees(run, root)).find(w => w.branch === branch)

  if (existing) {
    if (!same(existing.path, path)) return { isDone: false, reason: `${branch} is checked out at ${existing.path}, outside the layout` }
    const baseSha = await headOf(run, path, startPoint)
    return baseSha ? { isDone: true, path, baseSha } : { isDone: false, reason: `cannot read ${startPoint}` }
  }

  const baseSha = await headOf(run, root, startPoint)
  if (!baseSha) return { isDone: false, reason: `cannot read ${startPoint}` }

  const args = (await hasBranch(run, root, branch))
    ? ['git', '-C', root, 'worktree', 'add', path, branch]
    : ['git', '-C', root, 'worktree', 'add', '-b', branch, path, baseSha]
  const added = await run(args, { timeoutMs: 120_000 })

  return added.exitCode === 0 ? { isDone: true, path, baseSha } : { isDone: false, reason: added.stderr.trim() || 'git worktree add failed' }
}

// Clean means nothing to commit; advanced means the branch moved past where the slice started.
export async function devState(run: Run, path: string, baseSha: string): Promise<{ isClean: boolean; isAdvanced: boolean }> {
  const status = await run(['git', 'status', '--porcelain'], { cwd: path })
  const ahead = await run(['git', 'rev-list', '--count', `${baseSha}..HEAD`], { cwd: path })
  return { isClean: status.exitCode === 0 && status.stdout.trim() === '', isAdvanced: ahead.exitCode === 0 && Number(ahead.stdout.trim()) > 0 }
}

// Before QA: drop ignored build output, keeping the dependency folders named.
export async function cleanForQa(run: Run, path: string, keep: string[]): Promise<void> {
  await run(['git', 'clean', '-fdX', ...keep.flatMap(k => ['-e', `!${k}`])], { cwd: path, timeoutMs: 300_000 })
}

// A fresh start for a model takeover: back to where the slice began.
export async function resetSlice(run: Run, path: string, baseSha: string): Promise<void> {
  await run(['git', 'reset', '--hard', baseSha], { cwd: path })
  await run(['git', 'clean', '-fd'], { cwd: path })
}

export type Merge = { isMerged: true; commit: string } | { isMerged: false; conflicts?: string[]; failure?: string }

// Merges a slice into the integration worktree and verifies it with the repo's build and full
// suite. A conflict aborts; a red verify resets to the HEAD before the merge. Never guesses.
export async function integrate(run: Run, shell: Shell, integration: string, branch: string, message: string, commands: { build: string; test: string }): Promise<Merge> {
  const before = await headOf(run, integration)
  if (!before) return { isMerged: false, failure: 'cannot read the integration HEAD' }

  // Already in: an earlier attempt merged before the module went away, maybe since followed by
  // the slice branch's removal. The merge commit's subject is ours, so the history says so.
  const merges = await run(['git', 'log', '--merges', '--format=%H%x09%s', '-200'], { cwd: integration })
  const prior = merges.stdout.split('\n').find(line => line.split('\t')[1]?.startsWith(`Merge ${branch} (`))
  if (prior) return { isMerged: true, commit: prior.split('\t')[0] as string }

  const tip = await headOf(run, integration, branch)
  if (tip && (await run(['git', 'merge-base', '--is-ancestor', tip, before], { cwd: integration })).exitCode === 0) {
    return { isMerged: true, commit: before }
  }

  const dirty = await run(['git', 'status', '--porcelain', '--untracked-files=no'], { cwd: integration })
  if (dirty.stdout.trim()) return { isMerged: false, failure: 'the integration worktree has uncommitted changes' }

  const merged = await run(['git', 'merge', '--no-ff', '-m', message, branch], { cwd: integration, timeoutMs: 300_000 })

  if (merged.exitCode !== 0) {
    const unmerged = await run(['git', 'diff', '--name-only', '--diff-filter=U'], { cwd: integration })
    const conflicts = unmerged.stdout.split('\n').map(l => l.trim()).filter(Boolean)
    await run(['git', 'merge', '--abort'], { cwd: integration })
    await run(['git', 'reset', '--hard', before], { cwd: integration })
    return conflicts.length ? { isMerged: false, conflicts } : { isMerged: false, failure: merged.stderr.trim() || 'git merge failed' }
  }

  for (const [label, command] of [['build', commands.build], ['test', commands.test]] as const) {
    const result = await shell(command, integration)
    if (result.exitCode !== 0) {
      await run(['git', 'reset', '--hard', before], { cwd: integration })
      return { isMerged: false, failure: `${label} exited ${result.exitCode}: ${result.tail}` }
    }
  }

  const commit = await headOf(run, integration)
  return commit ? { isMerged: true, commit } : { isMerged: false, failure: 'cannot read the merge commit' }
}

// After a verified merge: the worktree goes first (build output and all), then the branch.
// `branch -d` measures against HEAD or the upstream, and neither is the integration branch, so
// the merge is confirmed here first and the branch deleted with -D.
export async function removeSlice(run: Run, root: string, path: string, branch: string, integration: string): Promise<Outcome<{}>> {
  const merged = await run(['git', '-C', root, 'merge-base', '--is-ancestor', `refs/heads/${branch}`, `refs/heads/${integration}`])
  if (merged.exitCode !== 0) return { isDone: false, reason: `${branch} is not in ${integration}; left in place` }
  const removed = await run(['git', '-C', root, 'worktree', 'remove', '--force', path], { timeoutMs: 120_000 })
  if (removed.exitCode !== 0) return { isDone: false, reason: removed.stderr.trim() || 'git worktree remove failed' }
  const deleted = await run(['git', '-C', root, 'branch', '-D', branch])
  return deleted.exitCode === 0 ? { isDone: true } : { isDone: false, reason: deleted.stderr.trim() || 'git branch -D failed' }
}

// The worktree holding a branch, when one does.
export async function checkedOutAt(run: Run, root: string, branch: string): Promise<string | null> {
  return (await worktrees(run, root)).find(w => w.branch === branch)?.path ?? null
}

export const isLayoutPath = (root: string, branch: string, path: string) => same(path, `${slashed(root)}/${branch}`)

export const tail = (text: string, max = 1500) => (text.length > max ? `…${text.slice(-max)}` : text).trim()
