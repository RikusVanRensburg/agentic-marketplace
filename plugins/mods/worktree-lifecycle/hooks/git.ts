// Git, read and written through the host's process runner. Nothing here is cached: the
// repo is the record, so every answer is what git says now.

export type Ran = { exitCode: number; stdout: string; stderr: string }

export type Run = (argv: readonly string[], options?: { cwd?: string; stdin?: string; timeoutMs?: number }) => Promise<Ran>

// `root` is the folder holding `.bare`, derived from the common git dir, never assumed.
export type Repo = { root: string; commonDir: string; isBareLayout: boolean }

export type WorktreeRow = { path: string; head: string | null; branch: string | null; isBare: boolean; isPrunable: boolean }

export type LifecycleKeys = { owner?: string; base?: string; isNotified?: boolean }

export function slashed(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/\/$/, '')
}

export async function repoAt(run: Run, cwd: string): Promise<Repo | null> {
  const common = await run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd })

  if (common.exitCode !== 0) {
    return null
  }

  const commonDir = slashed(common.stdout)
  const cut = commonDir.lastIndexOf('/')

  return { root: commonDir.slice(0, cut), commonDir, isBareLayout: commonDir.slice(cut + 1) === '.bare' }
}

// The branch the checkout at `cwd` is on; null at the repo root or on a detached HEAD.
export async function branchAt(run: Run, cwd: string): Promise<string | null> {
  const dirs = await run(['git', 'rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'], { cwd })
  const [gitDir, commonDir] = dirs.stdout.split('\n').map(slashed)

  if (dirs.exitCode !== 0 || gitDir === commonDir) {
    return null
  }

  const head = await run(['git', 'symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd })

  return head.exitCode === 0 ? head.stdout.trim() : null
}

export function parseWorktrees(porcelain: string): WorktreeRow[] {
  const rows: WorktreeRow[] = []

  for (const block of porcelain.replace(/\r/g, '').split(/\n\n+/)) {
    const row: WorktreeRow = { path: '', head: null, branch: null, isBare: false, isPrunable: false }

    for (const line of block.split('\n')) {
      const space = line.indexOf(' ')
      const word = space === -1 ? line : line.slice(0, space)
      const rest = space === -1 ? '' : line.slice(space + 1)

      if (word === 'worktree') row.path = slashed(rest)
      else if (word === 'HEAD') row.head = rest
      else if (word === 'branch') row.branch = rest.replace(/^refs\/heads\//, '')
      else if (word === 'bare') row.isBare = true
      else if (word === 'prunable') row.isPrunable = true
    }

    if (row.path !== '') {
      rows.push(row)
    }
  }

  return rows
}

export async function worktrees(run: Run, root: string): Promise<WorktreeRow[]> {
  const listed = await run(['git', '-C', root, 'worktree', 'list', '--porcelain'])

  return listed.exitCode === 0 ? parseWorktrees(listed.stdout) : []
}

// Git hands config keys back lowercased (`lifecycleowner`); the branch part keeps its case.
export function parseLifecycleKeys(text: string): Map<string, LifecycleKeys> {
  const keys = new Map<string, LifecycleKeys>()

  for (const line of text.replace(/\r/g, '').split('\n')) {
    const found = /^branch\.(.+)\.lifecycle(owner|base|notified) (.*)$/i.exec(line)

    if (!found) {
      continue
    }

    const [, branch = '', key = '', value = ''] = found
    const entry = keys.get(branch) ?? {}
    const name = key.toLowerCase()

    if (name === 'owner') entry.owner = value
    else if (name === 'base') entry.base = value
    else entry.isNotified = value === 'true'

    keys.set(branch, entry)
  }

  return keys
}

export async function lifecycleKeys(run: Run, root: string): Promise<Map<string, LifecycleKeys>> {
  const listed = await run(['git', '-C', root, 'config', '--get-regexp', '^branch\\..*\\.lifecycle'])

  return parseLifecycleKeys(listed.stdout)
}

export async function setKey(run: Run, root: string, branch: string, key: 'Owner' | 'Base' | 'Notified', value: string): Promise<boolean> {
  const set = await run(['git', '-C', root, 'config', `branch.${branch}.lifecycle${key}`, value])

  return set.exitCode === 0
}

// Local branch names and origin's, the latter without the `origin/` prefix.
export async function refNames(run: Run, root: string): Promise<{ local: string[]; remote: string[] }> {
  const listed = await run(['git', '-C', root, 'for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes/origin'])
  const local: string[] = []
  const remote: string[] = []

  for (const line of listed.stdout.replace(/\r/g, '').split('\n')) {
    if (line.startsWith('refs/heads/')) local.push(line.slice('refs/heads/'.length))
    else if (line.startsWith('refs/remotes/origin/') && line !== 'refs/remotes/origin/HEAD') remote.push(line.slice('refs/remotes/origin/'.length))
  }

  return { local, remote }
}

export async function hasRef(run: Run, root: string, ref: string): Promise<boolean> {
  return (await run(['git', '-C', root, 'rev-parse', '--verify', '--quiet', ref])).exitCode === 0
}

export async function shaOf(run: Run, root: string, ref: string): Promise<string | null> {
  const parsed = await run(['git', '-C', root, 'rev-parse', '--verify', '--quiet', ref])

  return parsed.exitCode === 0 ? parsed.stdout.trim() : null
}

export async function isAncestor(run: Run, root: string, older: string, newer: string): Promise<boolean> {
  return (await run(['git', '-C', root, 'merge-base', '--is-ancestor', older, newer])).exitCode === 0
}

export async function defaultBranch(run: Run, root: string): Promise<string | null> {
  const remote = await run(['git', '-C', root, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])

  if (remote.exitCode === 0) {
    return remote.stdout.trim().replace(/^origin\//, '')
  }

  const viewed = await run(['gh', 'repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'], { cwd: root })

  if (viewed.exitCode === 0 && viewed.stdout.trim() !== '') {
    return viewed.stdout.trim()
  }

  const head = await run(['git', '-C', root, 'symbolic-ref', '--quiet', '--short', 'HEAD'])

  return head.exitCode === 0 ? head.stdout.trim() : null
}

// Changes `git status` reports, ignored files left out: those never block a remove.
export async function changesAt(run: Run, path: string): Promise<string[]> {
  const status = await run(['git', '-C', path, 'status', '--porcelain'])

  return status.stdout.replace(/\r/g, '').split('\n').filter(line => line.trim() !== '')
}

export function firstLine(ran: Ran): string {
  const text = (ran.stderr.trim() || ran.stdout.trim()).split('\n')[0] ?? ''

  return text === '' ? `exit ${ran.exitCode}` : text
}
