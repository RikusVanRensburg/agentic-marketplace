---
name: ship
description: Push a finished branch and open its pull request, then stop. Merging happens only on an explicit instruction or the user's confirmation it already merged — after which this cleans up the worktree and closes the issues by hand.
---

# Ship a branch

Two gates, and they are the point of this skill: **the PR is opened only on the user's word, and the
merge is never yours to decide.** Everything after the merge — cleanup, closing issues — is
mechanical and needs no further asking.

## 1. Pre-flight

From the worktree holding the work:

```sh
git status --short                       # must be clean; commit or discard first, never stash
git log --oneline <target>..HEAD         # there must be something to ship
```

- **Uncommitted work** → commit it as its own change, or stop. Never `git stash` where a stash stack
  is shared between worktrees.
- **Verification** → the repo's own gates (typecheck, lint, tests for the packages touched) should
  already be green. If they have not been run, say so and let the user decide; do not push a branch
  whose state you cannot describe.

## 2. Determine the PR target — do not assume the default branch

The branch work integrates into is frequently **not** the repository's default branch.

```sh
gh repo view --json defaultBranchRef -q .defaultBranchRef.name
git branch -r --list 'origin/*'
git merge-base --fork-point origin/<candidate> HEAD   # closest candidate = most likely base
```

Take the target from the caller when given. Otherwise propose the closest candidate and confirm it
in one line before pushing. Note whether it differs from the default branch — step 6 depends on it.

## 3. Push

```sh
git push -u origin <branch>
```

## 4. Open the PR — then stop

```sh
gh pr create --base <target> --head <branch> --title "<title>" --body-file <draft>.md
```

The body says what changed and why, and how it was verified — including what was **not** verified.
Reference the issues it addresses.

Report the PR URL. **Then stop and wait.** A finished, green, pushed branch is not permission to
merge.

## 5. Merge — only when told

Merge on an explicit instruction to merge, or when the user says they have merged it themselves.
Never on your own initiative, and never because the checks went green.

```sh
gh repo view --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed
gh pr merge <n> --<strategy>
gh pr view <n> --json state,mergedAt,mergeCommit
```

Pick the strategy the repo allows and its recent history shows; if more than one fits, ask. If the
user merged it themselves, skip straight to verifying the merged state.

## 6. After the merge — no further asking needed

1. **Pull the target branch** in whichever worktree holds it, checking `git status` there first; a
   long-lived shared worktree often carries other sessions' uncommitted files.
2. **Clean up the worktree and branch** — use `worktree-clean`, which does the four steps in the
   order that works and proves the merge by SHA ancestry.
3. **Close the issues by hand when the target was not the default branch.** Closing keywords
   (`Closes #N`) fire only on a merge into the repository's default branch, so a PR merged anywhere
   else closes nothing however its body was written. Check the issue's actual state rather than
   assuming either way, and use the closing comment to record what landed and what was carried
   forward.
4. **Recreate a worktree for the next piece only when the user names it** — one worktree per stream
   of work, not one per change.

## Done when

- [ ] The branch was pushed only from a clean tree, with its verification state stated plainly.
- [ ] The PR target was established explicitly, and whether it differs from the default branch was
      noted.
- [ ] The PR URL was reported and the session stopped there.
- [ ] No merge happened without an explicit instruction or the user's confirmation.
- [ ] After merging: the target branch was pulled, the worktree and branch cleaned up, and every
      referenced issue either closed by hand or confirmed already closed.
