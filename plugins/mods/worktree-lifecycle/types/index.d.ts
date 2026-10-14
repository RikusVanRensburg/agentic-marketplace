// The `$.worktree` noun other mods call, and the values the confirmation band draws.
//
// Every method answers an outcome rather than throwing: `isDone` with the value, or
// `isDone: false` with the reason in words a person can act on.

export type WorktreeOutcome<T> = ({ isDone: true } & T) | { isDone: false; reason: string }

// What the mod knows about one branch it created, read live from git: the worktree from
// `git worktree list`, the rest from the branch's `lifecycle*` keys in the repo config.
export type WorktreeEntry = {
  branch: string
  // Null once the worktree is gone and only the branch is left.
  path: string | null
  // Who created it through this mod: `worktree-lifecycle` for the person or the model,
  // another plugin's name when that plugin called `$.worktree.create`.
  owner: string
  base: string | null
  isNotified: boolean
}

export type WorktreeCreateArgs = {
  // `feat`, `fix`, `docs`, `chore`, `refactor` or `test`, with `slug`; or a whole `branch`.
  type?: string
  slug?: string
  branch?: string
  // The branch to cut from; left out, the branch the working directory is on.
  base?: string
  // Where to look for the repo; left out, the session's working directory.
  cwd?: string
}

export type WorktreeCreated = { branch: string; path: string; base: string; startPoint: string; rule: string }

export type WorktreeShipArgs = {
  // Left out, the branch the working directory is on.
  branch?: string
  base?: string
  title?: string
  body?: string
  // Open the PR ready for review instead of as a draft.
  isReady?: boolean
  cwd?: string
}

export type WorktreeCleanArgs = { branch: string; cwd?: string }

export type WorktreeRepoArgs = { cwd?: string }

// One action waiting on the person's press in the band above the prompt.
export type WorktreePrepared = { id: string; title: string }

export type WorktreePr = {
  branch: string
  number: number
  url: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  base: string
  headSha: string
}

// Raised as the event `worktree.merged` when a merge of an owned branch is first seen.
export type WorktreeMerged = { root: string; branch: string; number: number; url: string; base: string }

export type WorktreeShipPlan = {
  kind: 'ship'
  root: string
  branch: string
  path: string
  base: string
  title: string
  body: string
  isDraft: boolean
  // The open PR the push goes to, when there already is one.
  openPr: string | null
}

export type WorktreeCleanPlan = {
  kind: 'clean'
  root: string
  branch: string
  path: string | null
  base: string
  // The worktree holding the base branch, fast-forwarded first; null when none does.
  baseWorktree: string | null
  // Why the base worktree is left alone, when it is.
  baseSkip: string | null
  hasRemoteRef: boolean
}

export type WorktreePending = {
  id: string
  title: string
  lines: string[]
  confirm: string
  plan: WorktreeShipPlan | WorktreeCleanPlan
}

export type Worktree = {
  create: (args: WorktreeCreateArgs) => Promise<WorktreeOutcome<WorktreeCreated>>
  // Ship, clean and sweep only prepare: the band asks the person, and their press runs it.
  ship: (args: WorktreeShipArgs) => Promise<WorktreeOutcome<WorktreePrepared>>
  clean: (args: WorktreeCleanArgs) => Promise<WorktreeOutcome<WorktreePrepared>>
  sweep: (args: WorktreeRepoArgs) => Promise<WorktreeOutcome<{ prepared: WorktreePrepared[] }>>
  check: (args: WorktreeRepoArgs) => Promise<WorktreeOutcome<{ prs: WorktreePr[] }>>
  list: (args: WorktreeRepoArgs) => Promise<WorktreeOutcome<{ entries: WorktreeEntry[] }>>
  merged: (args: WorktreeMerged) => Promise<void>
}

declare module 'claude-code' {
  interface EngineInterface {
    worktree: Worktree
  }

  interface PluginState {
    'worktree-lifecycle': { pending: WorktreePending[]; busy: string | null }
  }
}
