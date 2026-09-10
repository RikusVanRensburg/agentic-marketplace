---
name: work-finish
description: Finish a piece of work — push and open the PR, then, once you have approved the merge, tear the stack down and clean the worktree up.
disable-model-invocation: true
---

# Finish work

Three leaves with **two gates in the middle**, so this skill is resumable: run it again after each
approval and it continues from where the work actually stands.

## 1. Work out where things stand

Before doing anything, establish the state — the same call run twice must not push twice or merge
something already merged:

```sh
git status --short                      # clean?
git log --oneline @{upstream}..HEAD     # unpushed commits? (no upstream = never pushed)
gh pr list --head <branch> --state all --json number,state,mergedAt
```

Then enter at the right step:

| State | Do |
|---|---|
| Unpushed / no PR | step 2 |
| PR open, not merged | say so and **stop** — the merge is not yours to decide |
| PR merged (or user says it merged) | step 3 |

## 2. `rr-core:ship` — and stop where it stops

That leaf establishes the PR target explicitly (the integration branch is frequently not the
repository's default), pushes, opens the PR and reports the URL.

**Then stop.** Green and pushed is not permission to merge. Say plainly that the PR is open and
waiting on approval, and end the run.

## 3. After the merge — clean up without asking again

Only once the merge is confirmed — by an explicit instruction to merge, or by the user saying it has
landed. Then, in this order:

1. **`rr-core:stack-down`** — as a *removal*: stop, purge, delete the stack folder. Ports come back,
   and the stack's `.env` goes with it. Do this **before** touching the worktree: a running stack's
   processes hold files inside it and would block the delete.
2. **`rr-core:worktree-clean`** — proves the merge by SHA ancestry, deregisters, clears the
   gitignored leftovers, removes the branch in the order that lets `-d` work.
3. **Close the issues by hand.** Closing keywords fire only on a merge into the default branch, so a
   PR merged anywhere else closes nothing. Check each issue's real state; use the closing comment to
   record what landed and what was carried forward.

The shared `<root>\bin\<branch-slug>` folder and the `timebase/*` images are left alone — other
stacks use them.

## 4. Report

- The PR: number, target branch, and whether it is open or merged.
- What was removed: stack id and folder, worktree path, branch.
- Which issues were closed by hand, and any left open with the reason.
- That a new worktree will be created only when the next piece of work is named.

## Done when

- [ ] The entry point was established from real state, so a second run neither re-pushed nor
      re-merged.
- [ ] Nothing was merged without an explicit instruction or the user's confirmation.
- [ ] The stack was removed **before** the worktree, and both were confirmed gone.
- [ ] Every referenced issue was closed by hand or reported as deliberately left open.
- [ ] The shared bin folder, the images and every other stack were untouched.
