---
name: worktree-new
description: Create one git worktree for a new piece of work, obeying the repository's own CLAUDE.md worktree rules for folder path, branch naming and base branch instead of a hard-coded layout.
---

# New worktree

Create **one worktree and nothing else** — no dependency install, no build, no dev server, no
commit. Whatever the work needs next is another skill's job.

## 1. Find the rules before creating anything

**Nothing here is a hard-coded path.** Every location is derived, so this works unchanged when the
repo moves, is cloned somewhere else, or lives on another machine.

```sh
git rev-parse --git-common-dir     # ".../<repo>/.bare" (bare + worktrees) or ".../<repo>/.git"
git -C "<root>" worktree list      # what the layout ACTUALLY is
```

**Derive `<root>`:** the parent of the common git dir. If that dir is named `.bare` (or
`git rev-parse --is-bare-repository` is true there), `<root>` is a container holding the git data
plus sibling worktrees, and new worktrees belong under it. If it is a `.git` **inside** a normal
checkout, then `<root>` is that checkout — worktrees do **not** belong nested inside it, so ask
where they should go rather than guessing.

Then read, in this order, whichever exist:

1. `<root>/CLAUDE.md` — usually untracked and machine-local. It describes **this disk's layout** and
   wins on where worktrees go and how they are named.
2. The current worktree's tracked `CLAUDE.md`, plus any nested one covering the area being worked on
   — repo-wide conventions, which may add branch-naming or workflow rules.

**Cross-check what those files say against `worktree list`.** The existing worktrees are evidence:
their common parent is where worktrees actually go, whether each path equals its branch name shows
whether that rule holds, and their branch names show the naming pattern in use. Agreement means
proceed; a disagreement is worth one sentence to the user before creating anything, since it means
either a stale rule or a tree that broke the rule.

Where the files are silent **and** the existing worktrees show no clear pattern, fall back to:

- Every worktree lives **directly under `<root>`**, nowhere else on disk.
- The **folder path equals the branch name, verbatim**. Branch names contain slashes, so this
  produces nested folders — intended, not something to alias around
  (`feat/RVR-my-feature` → `<root>/feat/RVR-my-feature`). Never invent a short name.
- Branch names are `<type>/<INITIALS>-<kebab-description>`, `<type>` one of `feat`, `fix`, `chore`.
- Create with `git -C "<root>" worktree add "<root>/<branch>" -b <branch> <base>`.
- **Never** use the `EnterWorktree` tool, and never hand-create anything under
  `.claude/worktrees/` — that area belongs to orchestration tooling.

If the repo's own files contradict these defaults, the repo's files are right and these are stale.
Say so rather than quietly following the wrong one.

## 2. Resolve the inputs

| Input | Where it comes from |
|---|---|
| description | the arguments, or ask — one short kebab phrase naming the work |
| type | the arguments, else infer from the work (`feat` / `fix` / `chore`) and say which you chose |
| initials | `git config user.name` → initials (Rikus van Rensburg → `RVR`) |
| base branch | **the branch this session is already on**: `git rev-parse --abbrev-ref HEAD`. Never a hard-coded default — the long-lived branch changes |

Then state the plan on one line — `branch → path, off <base>`. If the branch name was given
explicitly, just create it. If you derived it from a description, confirm that one line first.

## 3. Check before creating

```sh
git -C "<root>" worktree list
```

- **A worktree already exists for this stream of work** → use it. One worktree per stream of work,
  not one per change; a second tree for the next change is a mistake, not tidiness.
- **The branch already exists** → don't pass `-b`; `worktree add "<path>" <branch>` checks it out.
  If it is already checked out in another worktree, git refuses — report which one holds it.
- **The target path already exists on disk** → stop and report. It is usually the leftover of a
  removed worktree (`worktree remove` leaves gitignored files behind), and deleting it is
  `worktree-clean`'s call, not this skill's.
- **`worktree list` shows a path that no longer exists** → `git -C "<root>" worktree prune`, then
  list again.
- **An existing worktree's folder path ≠ its branch name** → that is a rule violation, and the fix
  is `git -C "<root>" worktree move`, never remove-and-recreate (which loses untracked files). Only
  offer it; don't move a tree you didn't create without asking.

## 4. Create, then verify

```sh
git -C "<root>" worktree add "<root>/<branch>" -b <branch> <base>
git -C "<root>" worktree list
```

Report the absolute path, the branch, and the base branch it was cut from. Nothing else runs here.

## Done when

- [ ] `<root>` was derived from `git rev-parse --git-common-dir`, not assumed.
- [ ] The repo's own `CLAUDE.md` rules were read and cross-checked against `worktree list`, and any
      conflict — with each other or with this skill's defaults — was called out rather than
      silently resolved.
- [ ] The folder path follows the layout those rules describe (by default: equal to the branch name,
      verbatim, directly under `<root>`).
- [ ] The base is the branch the session was on, not a hard-coded branch name.
- [ ] `worktree list` shows the new tree, and its path and branch were reported to the user.
- [ ] No install, build, dev server or commit was run.
