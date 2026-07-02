---
name: workshop
version: 1.1.0
description: Use when a non-trivial task should not be trusted to a single agent — multi-step builds where one early mistake would compound. Runs an interactive brainstorming+grill design phase, then a headless plan→implement→review pipeline with the defending-findings mindset in every agent. Triggers include "run the workshop", "/rr:workshop", "orchestrate this", "design + plan + implement this", "peer review built in", "don't trust one agent for this".
argument-hint: "<task> [--scope PATH] [--resume]"
---

# Workshop

Orchestrates a non-trivial task through one resumable loop: an **interactive design phase**
(`superpowers:brainstorming` conducted with `rr:grill`'s interrogation discipline) followed
by a **headless pipeline** (`plan → implement → review`) driven by a packaged Workflow
script. Every dispatched agent carries the `rr:defending-findings` mindset. All artifacts
live under `<scope>/.ledger/<slug>/`. Stop anytime; resume from the last completed stage.

## The one loop

| Stage | Where | Engine | Output under `.ledger/<slug>/` |
|---|---|---|---|
| `design` | Main session (interactive) | `superpowers:brainstorming` + `rr:grill` | `specs/<date>-<slug>-design.md`, `grill/CONTEXT.md`, `grill/adr/` |
| `plan` | Headless (`workflow.js`) | `superpowers:writing-plans` | `plans/<date>-<slug>.md` |
| `implement` | Headless (`workflow.js` loop) | per task: **build → spec-compliance review → code-quality review** (bounded fix rounds), per `superpowers:subagent-driven-development` | code + commits |
| `verify` | Headless (`workflow.js`) | `superpowers:verification-before-completion` (gating) | test/verify evidence |
| `review` | Headless (`workflow.js`) | `superpowers:requesting-code-review` (gating, loops back to fix blockers) | `review/<date>-review.md` |

Verify and review **gate**: the run reaches `done` only when verification passes *and* review returns
zero blockers (bounded to 2 loopbacks; otherwise it returns `status: blocked` with the outstanding
blockers). A task that cannot pass its two-stage review after 2 fix rounds stops the run with
`status: needs_attention` — nothing advances silently.

## Branch contract — the workshop commits in place

**The workshop commits onto whatever branch is checked out, in the current working directory. It
creates NO branch and NO worktree** — isolation is the operator's responsibility. Be on an
appropriate feature branch (or a dedicated worktree) before running. Do not run it on a branch
whose history you are unwilling to have commits added to.

## Flow

1. User invokes `/rr:workshop <task>` (add `--resume` to continue an existing run).
2. Run `scripts/init-workshop.sh "<task>" [--scope PATH] [--resume]`. It resolves scope,
   creates `.ledger/<slug>/{grill,specs,plans,review}/`, verifies externals, and writes/
   reads `state.json`. It returns `<scope>|<slug>|<ledger-dir>|<state-json>`.
3. Read `state.json`. If `current_stage == design` (or fresh), run **Stage 0** below.
   Otherwise skip to Step 5 with `resumeStage = current_stage`.
4. **Stage 0 — design (interactive):** Invoke `superpowers:brainstorming` AND `rr:grill`.
   Conduct brainstorming's arc (explore context → clarifying questions → 2–3 approaches →
   present design) using grill's discipline (one question at a time, always with a
   recommended answer; read code before asking; sharpen fuzzy language). Point grill at the
   ledger: run its init with `--docs-root <ledger-dir>/grill`. Write the **design spec** to
   `<ledger-dir>/specs/<date>-<slug>-design.md` (this overrides superpowers' default
   `docs/superpowers/specs` path). When the user approves the design, update `state.json`:
   set `artifacts.context` + `artifacts.spec`, add `design` to `completed_stages`, set
   `current_stage` to `plan`.
5. **Before launching, assert the spec exists (G1):** confirm `state.json.artifacts.spec` is set
   and the file is present. If not, return to Stage 0 — never launch the workflow with a null spec.
   Compute today's `date` as `YYYY-MM-DD` (`date -u +%F`) — the Workflow runtime cannot read the
   clock, so the main session must pass it.
6. **Stages plan→verify→review — headless:** Launch the packaged workflow:
   `Workflow({ scriptPath: "<this-skill-dir>/workflow.js", args: { slug, ledgerDir, specPath,
   contextPath, date, resumeStage, tasks, tasksDone, verifyCmd } })`. On a fresh run omit
   `tasks`/`tasksDone`; on resume pass `tasks = state.json.tasks` (the locked list) +
   `tasksDone = state.json.tasks_done` so the implement loop skips done tasks. Record the
   returned `runId` into `state.json.workflow_run_id`.
7. **The main session owns `state.json` (S5).** The workflow writes nothing to disk — it *returns*
   a structured summary `{ status, planPath, tasks, tasksDone, commits, blockers, reviewPath,
   verifyEvidence }`. When it returns, **the main session writes** that summary into `state.json`
   (set `artifacts.plan`/`artifacts.review`, append `commits`, set `tasks` + `tasks_done`, set
   `status`, set `current_stage` per `status`: `done` → `done`, `blocked`/`needs_attention` →
   leave at the failing stage). Then
   surface to the user: `status`, the review path, the plan path, the commit list, and any blockers.

## defending-findings is a mindset, not a gate

There are no councils, no confidence gates, no voting. Instead, the
`rr:defending-findings` stance — guilty until proven innocent — is injected as a preamble
into every agent the workflow dispatches (the `DEFEND` constant in `workflow.js`) and is
applied by the main session during Stage 0. Each load-bearing claim is stated as a
falsifiable claim, the calibration class is named, the positive case is built and attacked,
and surviving evidence is cited inline. The review stage exercises it hardest.

## Resumability

`state.json` is the single source of truth, **written only by the main session** from the
workflow's returned summary. Re-invoke with `--resume` to continue from `current_stage`.
Cross-session resume relaunches `workflow.js` with `args.resumeStage` plus the locked `tasks`
list and the `tasksDone` ids (read from `state.json.tasks_done`) so completed tasks are skipped
and never re-committed. Same-session resume passes `resumeFromRunId = workflow_run_id`.

## Doc layout & .gitignore

All outputs live under `<scope>/.ledger/<slug>/`. The skill **never reads or modifies
`.gitignore`** — committing or ignoring `.ledger/` is entirely the user's choice (commit it
for durable cross-machine resume; ignore it for local-only artifacts).

## Required externals

`init-workshop.sh` refuses to start unless all are installed: `superpowers:brainstorming`,
`rr:grill`, `rr:defending-findings`, `superpowers:writing-plans`,
`superpowers:subagent-driven-development`, `superpowers:verification-before-completion`,
`superpowers:requesting-code-review`.

## When NOT to use

| Situation | Redirect to |
|---|---|
| Single-agent task fits the work | Just do it directly |
| One-shot question or quick fix | Direct response |
| Just want a design interview | `rr:grill` |
| Just want a plan | `superpowers:writing-plans` / `core:create-plan` |
| Just want a handover doc | `rr:handover` |

## Red flags — STOP

- About to edit cached superpowers plugin files to redirect docs — STOP. Redirect at prompt
  level via the `.ledger/<slug>/` paths the skill passes; never touch the cache.
- About to read or write `.gitignore` — STOP. The skill never touches it.
- About to skip the interactive brainstorming+grill design stage — STOP. Stage 0 is
  mandatory and human-in-loop.
- About to dispatch an agent without the `DEFEND` mindset preamble — STOP. Every agent
  carries it.
- A workflow agent about to spawn a subagent — STOP. Workflow agents are subagents; the
  per-task fan-out happens at the `workflow.js` orchestration level, not inside an agent.
- About to run on a branch you don't want commits on — STOP. The workshop commits in place and
  creates no branch/worktree. Switch to a feature branch first.
- About to let an agent write `state.json` — STOP. Only the main session writes it, from the
  workflow's returned summary.
- About to launch the workflow with a null/missing spec or `date` — STOP. Assert both first.

## Reference files

| File | Read when |
|---|---|
| [references/state-schema.md](references/state-schema.md) | Reading or writing `state.json`. |
