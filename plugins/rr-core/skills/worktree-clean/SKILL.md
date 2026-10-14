---
name: worktree-clean
description: Remove a finished git worktree completely — deregister it, clear the gitignored leftovers it keeps, and delete its branch — obeying the repository's own CLAUDE.md worktree rules, with the safety checks that removal order and unmerged work demand.
---

# Clean up a worktree

Removal is **not one command**. `git worktree remove` succeeds while leaving every gitignored file
on disk, and it succeeds while another process still holds those files. Doing the steps out of order
is what leaves stale administrative entries and locked directories behind.

This skill removes a worktree and, if it is no longer needed, its branch. It does not merge, push or
open anything.

## 1. Find the rules, and derive every path

**Nothing here is a hard-coded path.**

```sh
git rev-parse --git-common-dir     # ".../<repo>/.bare" or ".../<repo>/.git"; <root> is its parent
git -C "<root>" worktree list      # the registered trees, their branches and their paths
```

Read `<root>/CLAUDE.md` first (machine-local disk layout, and usually the file that spells out how
cleanup is done here), then the current worktree's tracked `CLAUDE.md`. Follow what they say; where
they are silent, the steps below are the defaults. If they contradict these defaults, they win — say
so rather than quietly following the wrong one.

**Run from `<root>` or from another worktree**, never from inside the one being removed.

## 2. Establish that it is safe — and yours — to remove

Never remove a worktree you did not create without checking it and confirming with whoever did.
Against the target path:

```sh
git -C "<path>" status --short                  # uncommitted or untracked work?
git -C "<path>" log --oneline @{upstream}..HEAD  # unpushed commits? (no upstream = nothing pushed yet)
```

- **Uncommitted or untracked changes** → stop and report them. `worktree remove` refuses anyway;
  `--force` is only for work you have been told is disposable, never a way past this check.
- **Unpushed commits** → stop and report. Losing them is unrecoverable.
- **A long-lived / shared tree** (the integration branch's own worktree, someone else's branch) →
  don't. Those regularly carry other sessions' uncommitted files.

Then prove the work actually landed, naming the integration branch explicitly — never assume the
repo's default branch is the one work merges into:

```sh
git -C "<root>" merge-base --is-ancestor <the tree's HEAD sha> origin/<integration-branch>
```

Use the **local commit SHA**, not `origin/<branch>`: a merged PR usually deletes the remote branch,
so a ref-based check fails with a dead ref and looks like unmerged work.

## 3. Free the files before deleting them

A worktree's directory is often held by processes whose parent shell died — long-lived dev servers
are the usual culprit, and killing a task does not reliably kill a `node` grandchild of `pnpm`.
`rm -rf` then fails with "Device or resource busy" on exactly those directories.

```powershell
Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object {
  $c = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
  if ($c -match '<worktree folder name>') { $_ }
} | Stop-Process -Force
```

Report anything you killed, and how long it had been running — a stale server holding a port also
explains a dev server that landed on an unexpected port earlier.

## 4. Remove, in this order

**Deregister first, delete files second.** Reversing these two is what leaves a stale entry needing
`worktree prune`.

```sh
git -C "<root>" worktree remove "<path>"     # clears the admin entry; leaves gitignored files
git -C "<root>" worktree list                # confirm it is gone from the list
```

Then confirm the directory holds **only** ignored artifacts before deleting it — adapt the excludes
to what this repo actually ignores:

```sh
find "<path>" -type f \
  -not -path "*/node_modules/*" -not -path "*/bin/*" -not -path "*/obj/*" | wc -l
```

Zero means safe: `rm -rf "<path>"`. Anything else, list the files and stop.

Finally, if the branch name nested the tree inside a parent folder (`feat/`, `fix/`, …), remove that
parent **only when it is now empty** — it usually still holds someone else's tree, so check first.

**If `worktree list` already shows a path that no longer exists on disk** (someone deleted a folder
by hand), the whole job is `git -C "<root>" worktree prune`, then list again to confirm.

## 5. Delete the branch — order decides whether it works

Only if the branch is no longer needed, and **delete the local branch before pruning remote refs**:

```sh
git -C "<root>" branch -d <branch>       # while origin/<branch> still exists, -d sees it merged
git -C "<root>" remote prune origin      # afterwards
```

Reversed, `-d` refuses with "not fully merged", because the only thing left to compare against is
the repo's HEAD — which, when work integrates into a non-default branch, does not contain the merge.
In that case re-run the `merge-base --is-ancestor` proof from step 2 and use `-D`, and say that you
did.

## 6. Report

- What was removed: path, branch, and the base/integration branch it was verified against.
- What was killed to free the directory, if anything.
- What was deliberately left behind: a non-empty parent folder, a branch kept on purpose, a tree
  skipped because it wasn't yours.

## Done when

- [ ] `<root>` and the target path were derived, not assumed, and the repo's own `CLAUDE.md` rules
      were read.
- [ ] Uncommitted, untracked and unpushed work were all checked, and the merge was proven by SHA
      ancestry against the named integration branch — not inferred from a PR or a remote ref.
- [ ] Deregistration happened before file deletion, and `worktree list` was checked to confirm it.
- [ ] The directory was verified to hold only ignored artifacts before `rm -rf`, and any parent
      folder was removed only if empty.
- [ ] The branch was deleted in the order that lets `-d` work, or `-D` was used with the ancestry
      proof stated.
- [ ] Nothing was `--force`d past a safety check, and nothing belonging to someone else was touched
      without asking.
