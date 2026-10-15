# worktree-lifecycle

Branches and worktrees for repos kept as a bare clone (`<repo>/.bare` plus one worktree per
branch at `<repo>/<branch>`). It starts work, ships a draft PR when you say yes, tells you when the
PR merged, and housekeeps when you say so. Guards stop the commands that break the layout.

It knows nothing about orchestration. Another mod can call it through `$.worktree`.

## Install

```
/plugin marketplace add RikusVanRensburg/agentic-marketplace
/plugin install worktree-lifecycle@agentic-marketplace
```

## Commands

| Command | Does |
|---|---|
| `/wt new <type> <slug> [--base <branch>]` | Creates `<type>/<initials>/<slug>` at `<repo>/<branch>`, cut from the working branch |
| `/wt new <branch> [--base <branch>]` | The same with a whole branch name |
| `/wt ship [<branch>] [--base <b>] [--title <t>] [--ready]` | Pushes and opens a draft PR (`--ready` for a normal one) |
| `/wt clean <branch>` | Fast-forwards the base, removes the worktree and the empty folders above it, `branch -d`, deletes `origin/<branch>` |
| `/wt sweep` | Housekeeps every merged branch the mod created |
| `/wt check` | Asks GitHub now whether those PRs merged |
| `/wt status` | The branches the mod created in this repo |

Every ship, clean and sweep runs at once, however it is asked for: a `/wt` command, the model's
tools (`worktree_new`, `worktree_ship`, `worktree_clean`, `worktree_sweep`, `worktree_check`,
`worktree_status`), or another mod through `$.worktree`. The yes is given before the call: typing
the command, telling the model, or the permission prompt for its tool call.

## Working branch

The working branch is where the work goes by default. Opened inside a worktree, that worktree is
the working branch. Opened on a repo root or an org folder (one holding bare repos), there is none
until a worktree is created. The session's own folder never moves: other repos and worktrees stay
open.

A worktree created in the working repo, or in one of the org folder's repos (`/wt new`,
`worktree_new`, `$.worktree.create`), is cut from the working branch and becomes it. Housekeeping
the working branch hands over to its base.

The model reads the working branch in the system prompt. Every `/wt` command and `worktree_*` tool
acts on it when not given a folder; another mod that passes `cwd` is not affected.

The working branch is kept in the session's state, so it survives a mod reload. It is not written to disk:
a new session starts from its folder again.

## Branch names

The repo's own rule wins: a regex in a CI workflow under `.github/workflows`, else a rule stated in
`CONTRIBUTING.md`, `CLAUDE.md` or `docs/agents/branches.md` (read by a small model). With none, the
name is `<type>/<initials>/<description>`, initials from `git config user.name`.

It never creates `<type>/<initials>/orchestration/...` branches, which belong to the orchestrator,
and refuses a name that would clash with an existing one (`a/b` beside `a/b/c`).

## Merges

There is no polling. A merge is noticed from the GitHub events the session receives, which arrive
when the desktop app is watching the PR, or when you run `/wt check` or `/wt sweep`. The first
session to see it tells you and names the `/wt clean` to run; it never housekeeps on its own.

## Guards

Refused in bare-layout repos, in both Bash and PowerShell:

- `EnterWorktree` (anywhere)
- `git stash` without a tag, `git stash save`, and every `git stash pop`: the stash stack is shared
- `git worktree add` whose path is not `<repo>/<branch>`, or with no branch

## State

Git is the record. Worktrees, PRs and merges are read live. The mod adds three keys to the repo
config for each branch it creates, and `git branch -d` removes them with the branch:

- `branch.<name>.lifecycleOwner`, who created it
- `branch.<name>.lifecycleBase`, the branch it was cut from
- `branch.<name>.lifecycleNotified`, set once a session has announced the merge

## For other mods

List `worktree-lifecycle` under `dependencies` in your `plugin.json` and call `$.worktree`:
`create`, `ship`, `clean`, `sweep`, `check`, `list`. Each answers `{ isDone: true, ... }` or
`{ isDone: false, reason }`. Hook the `worktree.merged` event to hear about merges. The types are
in `types/index.d.ts`.

Write each call out in full, `await $.worktree.create({ type: 'feat', slug: 'x' })`. The engine
refuses to load a module that binds the noun to a variable (`const w = $.worktree`).

## Empty folders

After the worktree goes, housekeeping removes its folder if git left it (Windows refuses to delete
a folder a process still holds; git deregisters the worktree anyway), then walks up the folders
the branch name made (`feat/RVR/`, then `feat/`), removing each while it is empty. The first folder
that still holds anything, such as another session's worktree, stops the walk, and `<repo>` itself
is never removed. A folder still held is left behind and named in the result; the branch is still
deleted.

## Known limits

- After a squash merge, `branch -d` needs `origin/<branch>` to measure the branch against. The
  mod's own fetches never prune it (`--no-prune`, whatever `fetch.prune` says), but a fetch run
  elsewhere with `fetch.prune` set can. Then `-d` refuses, and the mod stops and says so rather
  than using `-D`.
