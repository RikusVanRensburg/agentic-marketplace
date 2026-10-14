---
name: relay-run
description: Relay a run end-to-end on GitHub Issues — slices landing serially on one run branch, dispatched as sub-agent calls from this session. Use when the user says "relay this run" over a seed — a symptom, a change, a question they want driven to completion — or wants an existing run's issue tree resumed as a relay, mid-pipeline.
---

You are the **relay's router** — the skill that sequences this plugin's stage skills into one **pipeline**, from foggy idea to code committed on the **run branch**. This skill decides **which stage runs now**, asserts the gates between stages, and drives the merge back into the **base branch** — which stays as it was until the human chooses that merge.

**Two things the tree does not carry: the run branch and the worktree path.** The relay writes neither anywhere durable, so a session that did not run its pre-flight learns them one way only: ask the user for both. A wrong run branch reviews and merges the wrong work.

**The pipeline is shared with the other router; this skill adds rows 5–6.** Read
[../../docs/pipeline.md](../../docs/pipeline.md) before resolving anything —
it is the single source of truth for every part of the pipeline not defined below.

## Rows 5–6

**The first row that matches is the one to enter, and rows 1–4 in [../../docs/pipeline.md](../../docs/pipeline.md) come first.** Rows co-match: a resumed run whose map gained a research ticket after the spec was sliced satisfies row 2 and row 5 at once, and it enters row 2.

| # | Enter when | Stage |
|---|---|---|
| 5 | Spec has open slices | `rr-workshop:relay-implement` — relaunching against the same run branch *is* the resume |
| 6 | Every slice under the spec reads CLOSED, the human chose merge at the relay's disposition step, and the run branch is not yet in the base branch | Merge back — [../../docs/merge-back.md](../../docs/merge-back.md) |

Row 6 turns on three conditions. Check the **disposition** first: it is the condition this pipeline adds, and the one that reads as already satisfied once the other two hold.

- **Disposition** — the human chose *merge* at the relay's disposition step (`rr-workshop:relay-implement`, Stage 3), and you have their words for it. Every other choice on that menu parks the run: report where it stands and start nothing.
- **Slice state** — `gh issue list`, or `gh issue view <n> --json state` per slice. Here a slice closed `completed` means *committed green on the run branch*: the relay closes it that way once it built clean with a green full suite there. The state is the whole record; a landed slice carries no comment. A slice closed on any other reason was descoped rather than built, and still satisfies this row — descoped work is finished business — so report it as out of scope, never as landed.
- **Branch state** — the `git merge-base --is-ancestor` test in [../../docs/merge-back.md](../../docs/merge-back.md), which also carries the verdict when it comes back finished.

## Merging into the base branch

The go-ahead discipline and the mechanics are shared: [../../docs/merge-back.md](../../docs/merge-back.md), written in the Workflow path's vocabulary — read its closing **On the relay path** section first, which remaps that vocabulary and narrows the claims that read differently here.

## Standing discipline

- **One review.** The run's single code review is the end-of-run review inside `rr-workshop:relay-implement`'s Stage 3.

## Red flags — STOP

- A merge into the base branch forming without the user's go-ahead for *this* merge — stop and ask for it in this session.
- A `--force` or `reset --hard` reaching the base branch — stop.

## Done when

Every box in [../../docs/pipeline.md](../../docs/pipeline.md)'s shared checklist, plus:

- [ ] A run that reached row 6 has the user's go-ahead message in this session, preceding the merge — or their hold recorded as a comment on the spec issue.
- [ ] Every slice under the spec reads CLOSED.
- [ ] The spec, then the map when the run has one, closed with `gh issue close <n> --reason completed`.
- [ ] The user was asked about removing the worktree and deleting the run branch, and both stand until they answer.
- [ ] The end-of-run review's verdict is posted as a comment on the spec issue, carrying its findings when it returned any.
