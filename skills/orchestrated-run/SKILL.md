---
name: orchestrated-run
description: Orchestrate a substantial change end-to-end on GitHub Issues, from foggy idea to merged code — slices built in parallel waves by a shipped Workflow fan-out. Use when the user says "orchestrate this run" over a seed — a symptom, a change, a question they want driven to completion — or wants an existing run's issue tree resumed on the Workflow fan-out, mid-pipeline.
---

You are the **orchestrator** — the router that sequences this plugin's stage skills into one **pipeline**, from foggy idea to code merged on the human's branch. Each stage is a skill owning its own procedure, its own gate, and its own "Done when"; this skill decides **which stage runs now**, asserts the gates between stages, and drives the final merge-back. Code accumulates on **SOURCE**, the dedicated integration branch every slice merges into; **BASE**, the human's branch, stays untouched until the run's last act merges SOURCE into it.

**One thing the tree does not carry: SOURCE.** The workflow records the integration branch nowhere, so a session that did not launch it cannot recover the name — ask the user for it rather than inferring one, because a wrong SOURCE merges the wrong branch. (Writing it to the tree belongs in `rr-workshop:orchestration`'s post-run, not here.)

The run **spans sessions** by design; only the implement stage runs unattended end-to-end, with the run's one consolidated review inside it.

**The pipeline is shared with the other router; this skill adds rows 5–6.** Read
[../../docs/pipeline.md](../../docs/pipeline.md) before resolving anything —
it is the single source of truth for every part of the pipeline not defined below.

## Rows 5–6

**The first row that matches is the one to enter, and rows 1–4 in [../../docs/pipeline.md](../../docs/pipeline.md) come first.** Rows co-match: a resumed run whose map gained a research ticket after the spec was sliced satisfies row 2 and row 5 at once, and it enters row 2.

| # | Enter when | Stage |
|---|---|---|
| 5 | Spec has open slices | `rr-workshop:orchestration` — relaunching against the same SOURCE *is* the resume |
| 6 | Every slice under the spec reads CLOSED, and SOURCE's commits are not yet in BASE | Merge back — [../../docs/merge-back.md](../../docs/merge-back.md) |

Row 6 turns on two observable tests:

- **Slice state** — `gh issue list`, or `gh issue view <n> --json state` per slice. Integration closes a slice only after the merge built and the full suite passed on SOURCE, so CLOSED *is* the integration record. No comment of any kind is posted for an integration; do not look for one.
- **Branch state** — the `git merge-base --is-ancestor` test in [../../docs/merge-back.md](../../docs/merge-back.md), which also carries the verdict when it comes back finished.

## Merging into BASE

The go-ahead discipline and the mechanics are shared: [../../docs/merge-back.md](../../docs/merge-back.md). Two rationalizations are this path's own, on top of the ones it lists:

| Excuse | Reality |
|---|---|
| "The verdict is unavailable and they're AFK." | Absent a verdict, the moves are relaunch or wait. SOURCE holds every integrated slice intact indefinitely; nothing decays while you wait for a human. |
| "Blockers survived, but per-slice QA passed each slice, so it's safe." | Per-slice QA is why SOURCE is worth keeping, not why it is worth merging. Fix-first vs. fix-forward vs. hold is the user's call, and they have not made it. |

## Standing discipline

- **One consolidated review.** The run's single code review is the final-review stage inside orchestration's shipped workflow. Per-slice QA already gates every slice; no per-slice review, and no second review pass, ever comes from this skill.

## Red flags — STOP

- A merge into BASE forming without the go-ahead for *this* merge, or a `--force` / `reset --hard` reaching BASE.

## Done when

Every box in [../../docs/pipeline.md](../../docs/pipeline.md)'s shared checklist, plus:

- [ ] A run reaching row 6: the user's go-ahead preceded the merge (or their hold is recorded on the spec); every slice under the spec reads CLOSED; the spec, then the map, closed `--reason completed`; integration-branch deletion asked, not assumed; the final-review findings posted as a comment on the spec issue.
