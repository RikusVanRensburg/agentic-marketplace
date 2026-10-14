// The working branch: which repo and branch the session works on, picked in the band or taken
// from the folder the session opened. Like the rest it reads git live and draws nothing; the
// scope it answers is what the band and the system prompt show.

import type { WorktreeChoice, WorktreeScope, WorktreeWorking } from '../types'
import { branchAt, hasRef, lifecycleKeys, refNames, repoAt, slashed, worktrees, type Run } from './git'
import { isInside, samePath } from './paths'

export type Io = {
  run: Run
  exists: (path: string) => Promise<boolean>
  // The names of the folders directly inside `path`.
  dirs: (path: string) => Promise<string[]>
  isWindows: boolean
}

export const OTHER_BRANCH = ':branch'
export const OTHER_REPO = ':repo'

export function nameOf(root: string): string {
  const path = slashed(root)
  return path.slice(path.lastIndexOf('/') + 1)
}

export function labelOf(choice: WorktreeChoice): string {
  const from = choice.base === null ? '' : ` (from ${choice.base})`
  return choice.path === null ? `${choice.branch}${from}, no worktree` : `${choice.branch}${from}`
}

// The repos directly inside an org folder: each a folder holding `.bare`.
export async function reposIn(io: Io, org: string): Promise<string[]> {
  const top = slashed(org)
  const repos: string[] = []

  for (const name of await io.dirs(top)) {
    if (await io.exists(`${top}/${name}/.bare`)) repos.push(`${top}/${name}`)
  }

  return repos
}

// Branches with a worktree first, in git's order, then the other local branches by name.
export async function branchesOf(run: Run, root: string): Promise<WorktreeChoice[]> {
  const keys = await lifecycleKeys(run, root)
  const rows = (await worktrees(run, root)).filter(row => !row.isBare && !row.isPrunable && row.branch !== null)
  const { local } = await refNames(run, root)
  const seen = new Set(rows.map(row => row.branch))
  const baseOf = (branch: string) => keys.get(branch)?.base ?? null

  return [
    ...rows.map(row => ({ branch: row.branch ?? '', path: row.path, base: baseOf(row.branch ?? '') })),
    ...local.filter(branch => !seen.has(branch)).sort().map(branch => ({ branch, path: null, base: baseOf(branch) })),
  ]
}

// What the session's folder says: inside a worktree, that worktree is the working branch;
// at a repo root, pick a branch; in a folder of repos, pick a repo first. Null otherwise.
export async function scopeAt(io: Io, cwd: string): Promise<WorktreeScope | null> {
  const repo = await repoAt(io.run, cwd)
  const empty: WorktreeScope = { org: null, repos: [], root: null, branches: [], working: null, isPicking: true, note: null }

  if (repo !== null) {
    if (!repo.isBareLayout) {
      return null
    }

    const branches = await branchesOf(io.run, repo.root)
    const branch = await branchAt(io.run, cwd)
    const tree = branch === null ? undefined : branches.find(one => one.path !== null && isInside(cwd, one.path, io.isWindows))

    if (tree === undefined) {
      return { ...empty, root: repo.root, branches }
    }

    return { ...empty, root: repo.root, branches, working: { root: repo.root, ...tree }, isPicking: false }
  }

  const repos = await reposIn(io, cwd)

  return repos.length === 0 ? null : { ...empty, org: slashed(cwd), repos }
}

export async function pickRepo(io: Io, scope: WorktreeScope, root: string): Promise<WorktreeScope> {
  return { ...scope, root, branches: await branchesOf(io.run, root), note: null }
}

// A branch from the list, or any branch typed in: local or on origin, with or without a worktree.
export async function pickBranch(io: Io, scope: WorktreeScope, branch: string): Promise<WorktreeScope> {
  const root = scope.root

  if (root === null) {
    return { ...scope, note: 'Pick a repo first.' }
  }

  const known = scope.branches.find(one => one.branch === branch)

  if (known !== undefined) {
    return { ...scope, working: { root, ...known }, isPicking: false, note: null }
  }

  if ((await hasRef(io.run, root, `refs/heads/${branch}`)) || (await hasRef(io.run, root, `refs/remotes/origin/${branch}`))) {
    return { ...scope, working: { root, branch, path: null, base: null }, isPicking: false, note: null }
  }

  return { ...scope, note: `There is no branch ${branch} in ${nameOf(root)}, locally or on origin.` }
}

// A worktree just created: it becomes the working branch when it is in the scope's repo, or
// in one of its org's repos while none is picked yet.
export async function adopt(io: Io, scope: WorktreeScope, made: { branch: string; path: string; base: string }): Promise<WorktreeScope | null> {
  const path = slashed(made.path)
  const root = path.slice(0, path.length - made.branch.length - 1)
  const isOurs = scope.root === null ? scope.repos.some(one => samePath(one, root, io.isWindows)) : samePath(scope.root, root, io.isWindows)

  if (!isOurs) {
    return null
  }

  const branches = await branchesOf(io.run, root)

  return { ...scope, root, branches, working: { root, branch: made.branch, path, base: made.base }, isPicking: false, note: null }
}

// The branch list read again, and the working branch's worktree and base with it. A working
// branch deleted elsewhere hands back to the picker.
export async function refresh(io: Io, scope: WorktreeScope): Promise<WorktreeScope> {
  const root = scope.working?.root ?? scope.root

  if (root === null) {
    return scope
  }

  const branches = await branchesOf(io.run, root)
  const working = scope.working

  if (working === null || !samePath(working.root, root, io.isWindows)) {
    return { ...scope, branches }
  }

  const known = branches.find(one => one.branch === working.branch)

  if (known !== undefined) {
    return { ...scope, branches, working: { root, ...known } }
  }

  if (await hasRef(io.run, root, `refs/remotes/origin/${working.branch}`)) {
    return { ...scope, branches, working: { ...working, path: null } }
  }

  return { ...scope, root, branches, working: null, isPicking: true, note: `${working.branch} is gone; pick another branch.` }
}

// Housekeeping removed the working branch: its base takes over.
export function afterClean(scope: WorktreeScope, cleaned: { branch: string; base: string; baseWorktree: string | null }): WorktreeScope {
  const working = scope.working

  if (working === null || working.branch !== cleaned.branch) {
    return scope
  }

  return { ...scope, working: { root: working.root, branch: cleaned.base, path: cleaned.baseWorktree, base: null } }
}

export function summaryOf(working: WorktreeWorking): string {
  const from = working.base === null ? '' : `, cut from ${working.base}`

  return working.path === null
    ? `${nameOf(working.root)} on ${working.branch}${from}, which has no worktree yet`
    : `${nameOf(working.root)} on ${working.branch}${from}, worktree ${working.path}`
}

export function promptText(working: WorktreeWorking): string {
  const where =
    working.path === null
      ? `The branch ${working.branch} of ${working.root} has no worktree yet: before editing, create one with worktree_new (it cuts from ${working.branch}).`
      : `Make changes in ${working.path} (branch ${working.branch}${working.base === null ? '' : `, cut from ${working.base}`}), by path.`

  return [
    '# Working environment',
    `The person picked ${nameOf(working.root)} (${working.root}) as the working repo. ${where}`,
    'Other folders, repos and worktrees stay open to read and use when the task needs them; this only says where the work goes by default.',
    'The /wt commands and worktree_* tools act on this repo and branch unless told otherwise.',
  ].join('\n')
}
