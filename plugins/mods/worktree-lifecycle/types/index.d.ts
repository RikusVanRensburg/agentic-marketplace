// The `$.worktree` noun other mods call, and the working branch the session keeps.
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

// The branch the session works on: what the model is told, and where the lifecycle steps act
// when nobody names a repo or a base. The session's own folder never moves.
export type WorktreeWorking = {
  root: string
  branch: string
  // Its worktree; null when the branch has none yet.
  path: string | null
  // What it was cut from, from its lifecycle keys; null for a branch picked as the base itself.
  base: string | null
}

// One branch of the working repo: those with a worktree first, then local branches.
export type WorktreeChoice = { branch: string; path: string | null; base: string | null }

export type WorktreeScope = {
  // The org folder the session opened, when it holds repos rather than being one.
  org: string | null
  // The repo roots under `org`.
  repos: string[]
  // The repo the working branch is in, or the session's repo while there is none.
  root: string | null
  branches: WorktreeChoice[]
  working: WorktreeWorking | null
}

export type Worktree = {
  create: (args: WorktreeCreateArgs) => Promise<WorktreeOutcome<WorktreeCreated>>
  // Ship, clean and sweep run at once: the caller has the person's yes.
  ship: (args: WorktreeShipArgs) => Promise<WorktreeOutcome<{ text: string; url: string | null }>>
  clean: (args: WorktreeCleanArgs) => Promise<WorktreeOutcome<{ text: string }>>
  sweep: (args: WorktreeRepoArgs) => Promise<WorktreeOutcome<{ cleaned: string[]; skipped: string[] }>>
  check: (args: WorktreeRepoArgs) => Promise<WorktreeOutcome<{ prs: WorktreePr[] }>>
  list: (args: WorktreeRepoArgs) => Promise<WorktreeOutcome<{ entries: WorktreeEntry[] }>>
  merged: (args: WorktreeMerged) => Promise<void>
}

declare module 'claude-code' {
  interface EngineInterface {
    worktree: Worktree
  }

  interface PluginState {
    'worktree-lifecycle': { scope: WorktreeScope | null }
  }
}
