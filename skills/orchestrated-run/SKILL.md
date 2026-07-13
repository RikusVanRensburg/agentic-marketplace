---
name: orchestrated-run
version: 1.0.0
description: Orchestrate a non-trivial change end-to-end as the main session, dispatching subagents for investigation, design, planning, and implementation, then ONE consolidated code review at the very end. The defining discipline is grill-everything-up-front (exhaustive, architecture-first interrogation before any design), with rr:defending-findings applied to every choice in every stage and injected into every subagent. Use when the user wants to orchestrate a substantial build/rework, says "orchestrate this run", "let's do the full run", "grill it then build it", "you be the orchestrator", or describes a symptom/change and wants it interrogated thoroughly before any code is written — especially after a prior under-specified attempt forced a rework.
---

# Orchestrated Run

## What this is

You (the main session) are the **orchestrator**. The user describes what they see, want
changed, or want explained. You interrogate it to exhaustion, design and plan it, dispatch
subagents to implement the **entire** change, then run **one** consolidated code review at
the close. You pick the model for each subagent based on its task.

This exists because a prior attempt asked too few questions — *especially about
architecture* — and that under-specification forced a costly rework. The whole point of this
skill is to never let that happen again: **all questions are raised up front.**

## Non-negotiable operating contract

1. **User describes first.** Do not start grilling until the user has described a symptom, a
   desired change, or a "how does this work?" question. Then **read the relevant code before
   asking anything** — questions must be grounded, not generic.
2. **Grill everything up front.** Interrogate exhaustively, one question at
   a time, each with a recommended answer. Bias hard toward **architecture**: boundaries,
   ownership, state, data flow, lifecycle, extension points, coupling, failure modes. Refuse
   to let fuzzy language slide. Surface and resolve open architectural questions *before*
   design — this is the stage that was skimped last time.
3. **Defending-findings is a standing discipline, not a one-off.** Every load-bearing choice
   in **design, planning, AND implementation** — yours or a subagent's — runs through
   `rr:defending-findings`: state it as a falsifiable claim, name the calibration class,
   build the positive case, attack it, cite surviving evidence inline. Guilty until proven
   innocent. Never let a choice survive on assertion alone.
4. **Every dispatched subagent carries the defending-findings mindset.** Inject the `DEFEND`
   preamble (see `references/subagent-templates.md`) into every investigation/design/planning/
   implementation agent prompt.
5. **Full run, then ONE review.** Complete the entire pipeline — investigate → design →
   plan → implement everything — and only then run a single consolidated code review. Do NOT
   review per task or per line item.
6. **Two human gates, then unattended.** Gate 1: after the design spec. Gate 2: after the
   implementation pre-flight (task graph + dedicated integration branch presented, explicit
   launch approval). After Gate 2, the workflow runs fully unattended to completion.
7. **Respect project scope locks.** Honor any scope constraints from project memory / CLAUDE.md
   (e.g. which solutions may be modified, what is legacy/read-only). Read freely; modify only
   what the project rules permit.
8. **Implementation uses a shipped workflow script, targeting a dedicated integration branch —
   never the branch the human has checked out.** Stage 5 launches `orchestrated-run.js`
   (shipped with this skill, never edited per run) against `SOURCE`, a fresh branch created at
   pre-flight from the human's current branch (`BASE`). Per-task branches fork from and merge
   back into `SOURCE`; `BASE` is untouched until the orchestrator merges `SOURCE` into it
   interactively once the workflow returns. This is not a style choice — the workflow's
   worktree-based integration stage deadlocks if `SOURCE` is checked out anywhere, including
   your own primary worktree. The script owns parallelism, the escalation ladder, the circuit
   breaker, and the final review.

## The pipeline

| Stage | Engine | Who | Output |
|---|---|---|---|
| 0. Describe | user | user | the seed: symptom / change / question |
| 1. Investigate | read code + `core:codebase-research` / `Explore` subagents | orchestrator + subagents | grounding for grilling |
| 2. Grill | one-question-at-a-time interrogation (exhaustive, architecture-first) | orchestrator ↔ user | resolved terminology/decisions, carried into the Stage 3 design spec |
| 3. Design | synthesize answers into a spec; defend each choice | orchestrator (may dispatch design subagents) | `specs/<date>-<slug>-design.md` → **HUMAN GATE** |
| 4. Plan | `superpowers:writing-plans` | orchestrator (may dispatch a planning subagent) | `plans/<date>-<slug>.md` |
| 5. Implement | `orchestrated-run.js` (shipped workflow) | orchestrator launches; workflow runs unattended | code + commits on `SOURCE` (integration branch) → **LAUNCH GATE** |
| 6. Review (once) | built into `orchestrated-run.js` final review stage | workflow dispatches opus reviewer | blockers + nits returned in final report |
| 7. Merge back | `git merge` (ff-only, else resolved with the user) | orchestrator, interactively | `SOURCE` merged into `BASE`, blockers grilled + resumed as needed |

Steps 1–3 are interactive and front-loaded. Step 3 ends at Gate 1 (design approval). Step 5
has a pre-flight (build task graph, create a dedicated `SOURCE` integration branch off `BASE`,
get Gate 2 launch approval), then runs fully unattended. Step 7 happens back in this session,
merging the integration branch into the human's actual branch. See `references/playbook.md`
for the per-stage detail.

## Model selection

You choose the model for each subagent based on its task. See
`references/model-selection.md` for the heuristic (reasoning-heavy design/architecture →
Opus; broad mechanical search/locate → Sonnet/Haiku; etc.). Default to inheriting the session
model when unsure.

## Artifacts (ledger on disk)

All outputs live under `<scope>/.ledger/<slug>/` with subdirs `specs/`, `plans/`,
`review/`. `<slug>` is a kebab-case name for the run; `<scope>` is the repo root (or a
narrower path if the work is confined to one project). Compute `<date>` as `YYYY-MM-DD`. This
skill **never reads or modifies `.gitignore`** — committing or ignoring `.ledger/` is the
user's choice.

## Reference files

| File | Read when |
|---|---|
| `references/playbook.md` | Executing any stage — full per-stage procedure, spec/plan/review templates. |
| `references/subagent-templates.md` | Dispatching a Stage 1/3/4 subagent — the DEFEND preamble + per-stage prompt skeletons. Stages 5/6 are owned by the shipped workflow script, not manually dispatched. |
| `references/model-selection.md` | Choosing a model for a subagent. |

## Red flags — STOP

- About to grill before reading the relevant code — STOP. Ground questions in the code first.
- About to skip or shorten the architecture grilling — STOP. That omission is what caused the
  rework this skill exists to prevent.
- About to start design/plan/implement before the user has described the seed — STOP.
- About to make a design/plan/implementation choice without defending it — STOP. Run
  `rr:defending-findings` on it.
- About to dispatch a subagent without the DEFEND preamble — STOP.
- About to review per task instead of once at the end — STOP. Single consolidated review is
  built into the shipped workflow's Final Review stage.
- About to begin implementation without the design having passed Gate 1 — STOP.
- About to launch the workflow without completing the implementation pre-flight and getting
  Gate 2 launch approval — STOP.
- About to modify `orchestrated-run.js` for this specific run — STOP. It is a static shipped
  script; all per-run variation goes in `args`.
- About to modify a solution the project scope locks forbid — STOP.
- About to set `args.source` to the branch the human currently has checked out — STOP. It must
  be a dedicated integration branch created at pre-flight, or the integration stage deadlocks.
- About to merge the integration branch back into `BASE` without the user's go-ahead, or to
  force it — STOP.
