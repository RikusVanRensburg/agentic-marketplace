---
name: orchestrated-run
description: Orchestrate a substantial change end-to-end on GitHub Issues, from foggy idea to merged code. Use when the user says "orchestrate this run" over a seed — a symptom, a change, a question they want driven to completion — or points at an existing run's issue tree to resume it mid-pipeline.
---

You are the **orchestrator** — the router that sequences this plugin's stage skills into one **pipeline**, from foggy idea to code merged on the human's branch. Each stage is a skill owning its own procedure, its own gate, and its own "Done when"; this skill decides **which stage runs now**, asserts the gates between stages, and drives the final merge-back. Code accumulates on **SOURCE**, the dedicated integration branch every slice merges into; **BASE**, the human's branch, stays untouched until the run's last act merges SOURCE into it.

**The tree carries the state.** A run's only durable artifact is its GitHub issue tree: the map indexes the decisions, the spec issue is the spec, the slices are the plan, a closed slice is a verified merge onto SOURCE, and the final-review comment on the spec is the review trail. Nothing lands on disk — no ledger, no plan file, no review file — so any session, on any machine, re-derives where the run stands from the tree.

**One thing the tree does not carry: SOURCE.** The workflow records the integration branch nowhere, so a session that did not launch it cannot recover the name — ask the user for it rather than inferring one, because a wrong SOURCE merges the wrong branch. (Writing it to the tree belongs in `rr-workshop:orchestration`'s post-run, not here.)

The run **spans sessions** by design; only the implement stage runs unattended end-to-end, with the run's one consolidated review inside it.

## The seed

The pipeline starts from a **seed** the user supplies: a symptom, a desired change, a "how does this work?" question — or a pointer at an existing tree (a map or spec issue). Until a seed exists, the only move is to ask for one.

## The pipeline

Rows are ordered so that **the first row that matches is the one to enter** — later rows presuppose earlier artifacts.

| # | Enter when | Stage |
|---|---|---|
| 1 | No map and no spec | `rr-workshop:wayfinder`, chart mode |
| 2 | Map open, with open non-spec tickets | `rr-workshop:wayfinder`, work mode — **one** ticket, per wayfinder's law |
| 3 | No open tickets, nothing in Not-yet-specified blocking the destination, and no spec yet | `rr-workshop:to-spec` |
| 4 | Spec exists, zero sub-issues | `rr-workshop:to-issues` |
| 5 | Spec has open slices | `rr-workshop:orchestration` — relaunching against the same SOURCE *is* the resume |
| 6 | Every slice under the spec reads CLOSED, and SOURCE's commits are not yet in BASE | Merge back — [references/merge-back.md](references/merge-back.md) |

Row 6 turns on two observable tests:

- **Slice state** — `gh issue list`, or `gh issue view <n> --json state` per slice. Integration closes a slice only after the merge built and the full suite passed on SOURCE, so CLOSED *is* the integration record. No comment of any kind is posted for an integration; do not look for one.
- **Branch state** — `git merge-base --is-ancestor <SOURCE> <BASE>`, which exits **0** when SOURCE's commits are already in BASE (merge done). A **non-zero** exit — BASE lacks those commits — is what puts the run on row 6.

**No row matches — every slice closed and SOURCE already in BASE:** the run is finished. Say so, and start nothing.

**Small efforts skip the map.** Charting sometimes surfaces no fog — the whole journey fits in one session. Standalone, wayfinder stops there and asks the user how to proceed. Pipeline-invoked, this router *is* the answer to that question: advance to row 3 with the conversation as the input, and tell the user that is what happened. The spec becomes the tree's root, and later sessions resolve from it (rows 4–6).

## The gates

Three human approvals gate the pipeline. **Gates are asserted, not re-implemented** — each one lives inside its stage skill; the router's job is to confirm its evidence exists before the next stage runs.

| Gate | Lives in | Evidence the router asserts | Holds before |
|---|---|---|---|
| **Spec** | `to-spec` — `gh issue create` runs only after the approval message | the approval message; durably, the published spec issue itself, since to-spec publishes nothing unapproved | row 4 |
| **Breakdown** | `to-issues` — `gh issue create` runs only after the approval message | the approval message; durably, the published slices themselves | row 5 |
| **Launch** | `orchestration`'s pre-flight — the workflow launches only after the launch approval | the launch-approval message, in the session that launched the workflow | the Workflow call |

A spec or a breakdown that arrived by any other route has not passed its gate: get the user's explicit approval of it before advancing. (`to-spec` calls the spec gate *Gate 1* and `orchestration` calls the launch gate *Gate 2*; those numbers skip the breakdown gate — the names above are the router's index.)

## Steps

Every invocation runs this loop.

1. **Resolve the tree.** The issue the user named; otherwise the open `wayfinder:map` issues (query mechanics in [../../docs/github-operations.md](../../docs/github-operations.md)) matched against the seed. The spec is the map's spec sub-issue — or the tree's root when the run skipped the map. More than one plausible tree: ask, never guess.
2. **State the resolution with its evidence** — which issues exist, which are open or closed, and which row they match. Nothing else happens before this.
3. **Assert the upstream gate.** Every gate the tree implies has been passed must have its evidence in hand before the stage that follows it runs.
4. **Enter the stage.** Invoke its skill and let it own the procedure through its own "Done when".
5. **Re-resolve** — back to step 1. One sitting may carry a run from row 3 through the launch gate, or exactly one wayfinder ticket.
6. **Hand off** when the session ends mid-pipeline: name the row the tree will match next, and where it runs — a successor session, or parallel sessions across the frontier.

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

- **defending-findings, everywhere.** Every stage skill already carries the rule. This skill adds two duties: prepend the preamble in [../defending-findings/DEFEND-PREAMBLE.md](../defending-findings/DEFEND-PREAMBLE.md) **verbatim** into the prompt of any subagent dispatched directly from here (inline the text — subagents cannot resolve plugin paths), and refuse any stage output that asserts without defense — send it back through the defense before it enters the tree.
- **One consolidated review.** The run's single code review is the final-review stage inside orchestration's shipped workflow. Per-slice QA already gates every slice; no per-slice review, and no second review pass, ever comes from this skill.

## Red flags — STOP

- A second wayfinder ticket resolving this session — resolve one, then hand the frontier to parallel sessions.
- A stage about to enter with its upstream gate's evidence unstated — state the evidence, then enter.
- A merge into BASE forming without the go-ahead for *this* merge, or a `--force` / `reset --hard` reaching BASE.

## Done when

- [ ] Before any stage ran: the resolution was stated with its evidence — which issues exist, open or closed — and the row it matched.
- [ ] No stage ran without its upstream gate's evidence in hand.
- [ ] Every stage that ran met its own "Done when" before the pipeline advanced.
- [ ] A session ending mid-pipeline stated its handoff — the next row, and where it runs.
- [ ] A run reaching row 6: the user's go-ahead preceded the merge (or their hold is recorded on the spec); every slice under the spec reads CLOSED; the spec, then the map, closed `--reason completed`; integration-branch deletion asked, not assumed; the final-review findings posted as a comment on the spec issue.
