---
name: sdd-run
description: Subagent-driven run of a substantial change end-to-end on GitHub Issues, from foggy idea to code on one run branch — slices land serially in a single shared worktree, with no Workflow tool. Use when the user says "sdd-run" over a seed, wants a breakdown driven by a relay of subagents rather than a Workflow fan-out, or wants an existing run's issue tree resumed by a relay of subagents rather than a Workflow fan-out.
---

You are the **relay's router** — the skill that sequences this plugin's stage skills into one **pipeline**, from foggy idea to code committed on the **run branch**: the one branch every slice of this run commits to, and the branch the relay's shared worktree sits on. This skill decides **which stage runs now**, asserts the gates between stages, and drives the merge back into the **base branch** the run branch forked from — which stays as it was until the human chooses that merge.

**Two things the tree does not carry: the run branch and the worktree path.** The relay writes neither anywhere durable, so a session that did not run its pre-flight learns them one way only: ask the user for both. A wrong run branch reviews and merges the wrong work.

**The seed, tree resolution, rows 1–4 and the gates are shared.** Read
[../../docs/pipeline.md](../../docs/pipeline.md) before resolving anything —
it is the single source of truth for every row this skill does not define below.

## Rows 5–6

| # | Enter when | Stage |
|---|---|---|
| 5 | Spec has open slices | `rr-workshop:sdd-implement` — relaunching against the same run branch *is* the resume |
| 6 | Every slice under the spec reads CLOSED, the human chose merge at the relay's disposition step, and the run branch is not yet in the base branch | Merge back — [../orchestrated-run/references/merge-back.md](../orchestrated-run/references/merge-back.md) |

Row 6 turns on three conditions. Check the **disposition** first: it is the condition this pipeline adds, and the one that reads as already satisfied once the other two hold.

- **Disposition** — the human chose *merge* at the relay's disposition step (`rr-workshop:sdd-implement`, Stage 3), and you have their words for it. A run whose review passed and whose human chose to open a PR, remediate, or leave the worktree standing sits parked on that choice: report where it stands and start nothing. It reaches row 6 when they say merge, and only then.
- **Slice state** — `gh issue list`, or `gh issue view <n> --json state` per slice. Here CLOSED means *committed green on the run branch*: the relay closes a slice once it built clean with a green full suite there. That is a narrower claim than the Workflow path's verified merge onto an integration branch, so where `pipeline.md` glosses a closed slice as a merge onto SOURCE, read this meaning instead — the run branch is the only branch this run touches. The state is the whole record; a landed slice carries no comment.
- **Branch state** — `git merge-base --is-ancestor <run branch> <base branch>` exits **0** when the base branch already carries the run's commits. A **non-zero** exit is what puts the run on row 6.

**No row matches** — every slice closed and the run branch already in the base branch: the run is finished. Say so, and start nothing.

## Merging into BASE

The merge is the run's one irreversible act on the human's branch. It happens on the user's **go-ahead for this merge** — of this run branch, into the base branch as it stands now — with every conflict resolved alongside them.

Mechanics: [../orchestrated-run/references/merge-back.md](../orchestrated-run/references/merge-back.md), written in the Workflow path's vocabulary — read its SOURCE as the run branch, its BASE as the base branch, and its relaunch as `rr-workshop:sdd-implement` against the same run branch.

| Excuse | Reality |
|---|---|
| "They approved the relay launch — that covers the merge." | The launch approval authorized spending sub-agents on a graph, given before a line of code existed. It reaches as far as the run branch and no further. |
| "They said merge it last session." | The go-ahead is for this run branch against the base branch *as it stands now*. Either branch moving retires it. Re-ask; it costs one message. |
| "The conflict is trivial." | A conflict means the base branch moved under the run. Whoever moved it knows why, and you do not. Resolve it with them, hunk by hunk. |
| "`--ff-only` refused, so I'll force it / reset the base branch to the run branch." | Force discards commits on the human's branch that the run never saw. There is no state of this pipeline where that is the right move. |
| "I'll merge and tell them — it's revertible." | Reverting a merge on a shared branch is a second public event, not an undo. |

## Standing discipline

- **One review.** The run's single code review is the end-of-run review inside `rr-workshop:sdd-implement`'s Stage 3. Per-slice verification already gates every slice on a green suite, so this skill's work on a review is to relay its verdict and post its findings on the spec issue.

## Red flags — STOP

- A merge into the base branch forming without the user's go-ahead for *this* merge — stop and ask for it in this session.
- A `--force` or `reset --hard` reaching the base branch — stop. The base branch advances by a merge on a go-ahead, and by nothing else.

## Done when

Every box in [../../docs/pipeline.md](../../docs/pipeline.md)'s shared checklist, plus:

- [ ] A run that reached row 6 has the user's go-ahead message in this session, preceding the merge — or their hold recorded as a comment on the spec issue.
- [ ] Every slice under the spec reads CLOSED.
- [ ] The spec, then the map when the run has one, closed with `gh issue close <n> --reason completed`.
- [ ] The user was asked about removing the worktree and deleting the run branch, and both stand until they answer.
- [ ] The end-of-run review's findings are posted as a comment on the spec issue.
