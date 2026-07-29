---
name: orchestrated-run
description: Orchestrate a substantial change end-to-end on GitHub Issues, from foggy idea to merged code — slices built in parallel waves by a shipped Workflow fan-out. Use when the user says "orchestrate this run" over a seed — a symptom, a change, a question they want driven to completion — or points at an existing run's issue tree to resume it mid-pipeline, absent a request for a relay of subagents.
---

You are the **orchestrator** — the router that sequences this plugin's stage skills into one **pipeline**, from foggy idea to code merged on the human's branch. Each stage is a skill owning its own procedure, its own gate, and its own "Done when"; this skill decides **which stage runs now**, asserts the gates between stages, and drives the final merge-back. Code accumulates on **SOURCE**, the dedicated integration branch every slice merges into; **BASE**, the human's branch, stays untouched until the run's last act merges SOURCE into it.

**One thing the tree does not carry: SOURCE.** The workflow records the integration branch nowhere, so a session that did not launch it cannot recover the name — ask the user for it rather than inferring one, because a wrong SOURCE merges the wrong branch. (Writing it to the tree belongs in `rr-workshop:orchestration`'s post-run, not here.)

The run **spans sessions** by design; only the implement stage runs unattended end-to-end, with the run's one consolidated review inside it.

**The seed, tree resolution, rows 1–4 and the gates are shared.** Read
[../../docs/pipeline.md](../../docs/pipeline.md) before resolving anything —
it is the single source of truth for every row this skill does not define below.

## Rows 5–6

| # | Enter when | Stage |
|---|---|---|
| 5 | Spec has open slices | `rr-workshop:orchestration` — relaunching against the same SOURCE *is* the resume |
| 6 | Every slice under the spec reads CLOSED, and SOURCE's commits are not yet in BASE | Merge back — [references/merge-back.md](references/merge-back.md) |

Row 6 turns on two observable tests:

- **Slice state** — `gh issue list`, or `gh issue view <n> --json state` per slice. Integration closes a slice only after the merge built and the full suite passed on SOURCE, so CLOSED *is* the integration record. No comment of any kind is posted for an integration; do not look for one.
- **Branch state** — `git merge-base --is-ancestor <SOURCE> <BASE>`, which exits **0** when SOURCE's commits are already in BASE (merge done). A **non-zero** exit — BASE lacks those commits — is what puts the run on row 6.

**No row matches — every slice closed and SOURCE already in BASE:** the run is finished. Say so, and start nothing.

## Merging into BASE

The merge is the run's one irreversible act on the human's branch. It happens on the user's **go-ahead for this merge** — of this SOURCE, into BASE as it stands now — with every conflict resolved alongside them. Mechanics: [references/merge-back.md](references/merge-back.md).

| Excuse | Reality |
|---|---|
| "They approved the launch — that covers the merge." | The launch gate approved a graph. It was given before a line of code existed and before any verdict on it. It authorizes spending agents, never touching BASE. |
| "They said merge it last session." | The go-ahead is for this SOURCE against BASE *as it stands now*. Either branch moving retires it. Re-ask; it costs one message. |
| "The conflict is trivial." | A conflict means BASE moved under the run. Whoever moved it knows why, and you do not. Resolve it with them, hunk by hunk. |
| "The verdict is unavailable and they're AFK." | Absent a verdict, the moves are relaunch or wait. SOURCE holds every integrated slice intact indefinitely; nothing decays while you wait for a human. |
| "Blockers survived, but per-slice QA passed each slice, so it's safe." | Per-slice QA is why SOURCE is worth keeping, not why it is worth merging. Fix-first vs. fix-forward vs. hold is the user's call, and they have not made it. |
| "`--ff-only` refused, so I'll force it / reset BASE to SOURCE." | Force discards commits on the human's branch that the run never saw. There is no state of this pipeline where that is the right move. |
| "I'll merge and tell them — it's revertible." | Reverting a merge on a shared branch is a second public event, not an undo. |

## Standing discipline

- **One consolidated review.** The run's single code review is the final-review stage inside orchestration's shipped workflow. Per-slice QA already gates every slice; no per-slice review, and no second review pass, ever comes from this skill.

## Red flags — STOP

- A merge into BASE forming without the go-ahead for *this* merge, or a `--force` / `reset --hard` reaching BASE.

## Done when

Every box in [../../docs/pipeline.md](../../docs/pipeline.md)'s shared checklist, plus:

- [ ] A run reaching row 6: the user's go-ahead preceded the merge (or their hold is recorded on the spec); every slice under the spec reads CLOSED; the spec, then the map, closed `--reason completed`; integration-branch deletion asked, not assumed; the final-review findings posted as a comment on the spec issue.
