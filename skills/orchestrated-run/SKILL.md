---
name: orchestrated-run
description: Orchestrate a substantial change end-to-end on GitHub Issues, from foggy idea to merged code, with two human gates. Use when the user says "orchestrate this run", "the full run", "grill it then build it", "you be the orchestrator", describes a symptom or change they want driven to completion, or wants to resume a run mid-pipeline from its issue tree.
---

You are the **orchestrator** — the router that sequences this plugin's stage skills into one **pipeline**, from foggy idea to code merged on the human's branch. Each stage is a skill that owns its own procedure, its own gate, and its own "Done when"; this skill decides **which stage runs now**, asserts the gates between stages, and drives the final merge-back.

**The tree carries the state.** A run's only durable artifact is its GitHub issue tree: the map is the decisions index, the spec issue is the spec, the slices are the plan, and the integrate comments plus the final-review comment on the spec are the review trail. Nothing about the run lives on disk — no ledger, no plan file, no review file — so any session, on any machine, re-derives where the run stands from the tree alone. The run **spans sessions** by design; only the implement stage runs unattended end-to-end, with the run's one consolidated review inside it.

## The seed

The pipeline starts from a **seed** the user supplies: a symptom, a desired change, a "how does this work?" question — or a pointer at an existing tree (a map or spec issue). Until a seed exists, the only move is to ask for one.

## The pipeline

| Stage | Skill | GitHub artifact | Gate |
|---|---|---|---|
| 1. Find the way | `rr-workshop:wayfinder` | map issue + tickets | — |
| 2. Spec | `rr-workshop:to-spec` | spec issue, sub-issue of the map | **Gate 1** — spec approval |
| 3. Break down | `rr-workshop:to-issues` | slice sub-issues, `state: ready-for-agent` | breakdown approval (the skill's quiz) |
| 4. Implement | `rr-workshop:orchestration` | commits on SOURCE; integrate comments on slices | **Gate 2** — launch approval |
| 5. Merge back | this skill, interactively | SOURCE merged into BASE; slices, spec, map closed; review findings on the spec | — |

Stages 1–3 are interactive; after Gate 2 the workflow runs unattended to completion; Stage 5 is interactive again.

**Gates are asserted, not re-implemented.** Gate 1 lives inside to-spec's approval loop (`gh issue create` runs only after the explicit approval message); Gate 2 lives inside orchestration's pre-flight (the workflow launches only after the explicit launch approval). The router's job is to assert each gate's evidence before advancing past it:

- **Gate 1 evidence:** the approval message — durably, the published spec issue itself, since to-spec publishes nothing unapproved. A spec that arrived by any other route has not passed Gate 1: get the user's explicit approval of it before slicing.
- **Gate 2 evidence:** the explicit launch-approval message in the session that launched the workflow.

## Stage resolution — where the run stands

On every invocation, **before anything else**, resolve where the run stands from the tree, and state the resolution **with its evidence** — which issues exist, and which are open or closed — before any stage runs.

Locate the tree: the issue the user named; otherwise the open `wayfinder:map` issues (query mechanics in [../../docs/github-operations.md](../../docs/github-operations.md)) matched against the seed. The spec is the map's spec sub-issue — or the tree's root when the run skipped the map. More than one plausible tree: ask, never guess.

Enter the **first case that matches** (later stages presuppose earlier artifacts, so the order is safe):

1. **No map and no spec** → **Stage 1**: `rr-workshop:wayfinder`, chart mode.
2. **Map open with open non-spec tickets** → **Stage 1**: wayfinder, work mode. One ticket per session is wayfinder's law: resolve **one**, then tell the user how to parallelize — each unblocked frontier ticket can run in its own session. This session never bulldozes the ticket list.
3. **The way is clear** — no open tickets, nothing in Not-yet-specified blocking the destination — **and no spec yet** → **Stage 2**: `rr-workshop:to-spec`.
4. **Spec exists (Gate 1 passed) with zero sub-issues** → **Stage 3**: `rr-workshop:to-issues`.
5. **Spec has open `state: ready-for-agent` sub-issues not yet integrated** (no integrate comment) → **Stage 4**: `rr-workshop:orchestration` — which resumes as naturally as it starts: already-integrated slices ride the `integrated` resume channel.
6. **Slices integrated on SOURCE, BASE behind** — every remaining slice carries an "integrated into `<SOURCE>` at `<sha>`" comment (or was closed by a `closeOnIntegrate` run) and BASE lacks those commits → **Stage 5**: merge-back per [references/merge-back.md](references/merge-back.md), then close the integrated slices, then the spec, then the map — each `gh issue close --reason completed`.

**Small efforts skip the map.** When Stage 1's charting surfaces no fog — the whole journey fits one session — wayfinder stops; skip to Stage 2 with the conversation as the input. The spec becomes the tree's root, and later sessions resolve from it (cases 4–6).

Enter the stage by invoking its skill and let it own the procedure. When its "Done when" is met, re-resolve and continue — one sitting may carry a run from Stage 2 through Gate 2, or exactly one wayfinder ticket. A session that ends mid-pipeline ends with a stated **handoff**: which case the tree will match next, and where that runs (a successor session, or parallel sessions across the frontier).

## Standing discipline

- **defending-findings, everywhere.** Every stage skill already carries the rule. This skill adds two duties: prepend the preamble in [../defending-findings/DEFEND-PREAMBLE.md](../defending-findings/DEFEND-PREAMBLE.md) **verbatim** into the prompt of any subagent dispatched directly from here (inline the text — subagents cannot resolve plugin paths), and refuse any stage output that asserts without defense — send it back through the ritual before it enters the tree.
- **One consolidated review.** The run's single code review is the final-review stage inside orchestration's shipped workflow. Per-slice QA already gates every slice; no per-slice review, and no second review pass, ever comes from this skill.
- **Scope locks.** Honor scope constraints from CLAUDE.md / project memory at every stage: read freely, modify only what the project rules permit.

## Red flags — STOP

- A stage entered before the resolution and its evidence were stated.
- Grilling, design, or code before the user has supplied the seed.
- A second wayfinder ticket resolving in this session — parallelism belongs to other sessions.
- Re-charting or re-speccing what the tree already holds — a new session resumes; it never restarts.
- Advancing on a missing gate: no approval behind the spec, or a workflow call forming before the launch-approval message exists.
- A directly-dispatched subagent without the DEFEND preamble prepended verbatim.
- A stage output entering the tree on bare assertion.
- A per-slice review forming — the run's one review lives inside the shipped workflow.
- Run state landing on disk — ledger folders, plan files, review files. The tree carries the state; findings belong on the spec issue.
- A change forming in an area the project's scope locks forbid.
- SOURCE merging into BASE without the user's go-ahead — or by force.

## Done when

- [ ] Stage resolution was stated, with its evidence — which issues exist, open or closed — before any stage ran.
- [ ] Every stage that ran met its own "Done when" before the pipeline advanced.
- [ ] For every gate the run has passed: Gate 1 evidence exists (the approval message / the published spec), Gate 2 evidence exists (the launch-approval message).
- [ ] A session ending mid-pipeline stated its handoff — the next case, and where it runs.
- [ ] A run reaching Stage 5: SOURCE merged into BASE (or the user's explicit hold recorded on the spec); every integrated slice closed `--reason completed`, then the spec, then the map; integration-branch deletion asked, not assumed; the final-review findings posted as a comment on the spec issue.
