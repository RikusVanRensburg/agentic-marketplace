// The git the mod runs itself: worktrees, and reads that check an agent's work. Merging,
// building and testing are the merge agent's. Every function here is safe to call twice: a
// reload can re-issue an effect that already half ran.

export type Ran = { exitCode: number; stdout: string; stderr: string }

export type Run = (argv: readonly string[], options?: { cwd?: string; stdin?: string; timeoutMs?: number }) => Promise<Ran>

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

export type MergeCheck = { problem: string | null; commits: Record<string, string> }

// Checks the merge agent's work against what it reported, reading git only: HEAD grew from
// where the batch started, the tree is clean, each branch is in or out as reported, nothing but
// merge commits landed, and each merge is exactly what git merges by itself. A conflict the
// agent resolved, or an edit it slipped into a merge, would reach the branch without QA.
export async function checkMerge(run: Run, path: string, before: string, merged: string[], unmerged: string[]): Promise<MergeCheck> {
  const fail = (problem: string): MergeCheck => ({ problem, commits: {} })
  const isAncestor = async (a: string, b: string) => (await run(['git', 'merge-base', '--is-ancestor', a, b], { cwd: path })).exitCode === 0

  const head = await headOf(run, path)
  if (!head) return fail('cannot read the integration HEAD')
  if (!before) return fail('no HEAD was recorded before the batch')
  if (head !== before && !(await isAncestor(before, head))) return fail(`HEAD ${head} does not grow from ${before}`)

  const dirty = await run(['git', 'status', '--porcelain', '--untracked-files=no'], { cwd: path })
  if (dirty.exitCode !== 0 || dirty.stdout.trim()) return fail(`the integration worktree has uncommitted changes: ${firstLines(dirty.stdout)}`)

  const tips: Record<string, string> = {}
  for (const branch of merged) {
    const tip = await headOf(run, path, `refs/heads/${branch}`)
    if (!tip) return fail(`cannot read ${branch}`)
    if (!(await isAncestor(tip, head))) return fail(`${branch} is reported merged but is not in HEAD`)
    tips[branch] = tip
  }
  for (const branch of unmerged) {
    const tip = await headOf(run, path, `refs/heads/${branch}`)
    if (tip && (await isAncestor(tip, head)) && !(await isAncestor(tip, before))) return fail(`${branch} is reported not merged but is in HEAD`)
  }

  const extra = await run(['git', 'rev-list', '--no-merges', head, `^${before}`, ...Object.values(tips).map(t => `^${t}`)], { cwd: path })
  if (extra.exitCode !== 0) return fail('cannot list the commits the batch added')
  if (extra.stdout.trim()) return fail(`commits other than merges landed: ${firstLines(extra.stdout)}`)

  const listed = await run(['git', 'log', '--merges', '--format=%H %P', `${before}..${head}`], { cwd: path })
  if (listed.exitCode !== 0) return fail('cannot list the merges the batch added')
  const commits: Record<string, string> = {}
  for (const line of lines(listed.stdout)) {
    const [sha = '', first = '', second = ''] = line.split(/\s+/)
    const redone = await run(['git', 'merge-tree', '--write-tree', first, second], { cwd: path })
    const tree = await run(['git', 'rev-parse', `${sha}^{tree}`], { cwd: path })
    if (redone.exitCode !== 0 || lines(redone.stdout)[0] !== tree.stdout.trim()) {
      return fail(`merge ${sha} is not the merge git makes by itself: a resolved conflict or an edit`)
    }
    const branch = Object.keys(tips).find(b => tips[b] === second)
    if (branch) commits[branch] = sha
  }
  for (const branch of merged) {
    if (commits[branch]) continue
    // In before the batch started, from an earlier attempt or run: nothing new to name.
    if (await isAncestor(tips[branch] as string, before)) commits[branch] = before
    else return fail(`${branch} is in HEAD but not through a merge of its tip`)
  }
  return { problem: null, commits }
}

const lines = (text: string) => text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)

const firstLines = (text: string) => lines(text).slice(0, 5).join(', ')

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
