# Orchestrated Run — Playbook

Per-stage procedure. The orchestrator (main session) drives all of this. Read
`subagent-templates.md` before dispatching any agent and `model-selection.md` before choosing
its model.

## Setup

1. Confirm the seed: the user has described a symptom, a change, or a "how does it work?"
   question. If not, ask for it. Do not proceed without it.
2. Pick a `<slug>` (kebab-case) and `<scope>` (repo root, or a narrower project path if the
   work is confined). Compute `<date>` = `date -u +%F`.
3. Create the ledger: `<scope>/.ledger/<slug>/{specs,plans,review}/`. Never touch
   `.gitignore`.
4. Confirm the checked-out branch is one the user accepts commits on — ledger docs land here
   directly, and this branch becomes `BASE` at Stage 5's pre-flight (see below).

## Stage 1 — Investigate (ground the grilling)

Before asking the user anything, build a grounded map. Read the relevant code directly and/or
dispatch read-only investigation subagents (`Explore`, `core:codebase-locator`,
`core:codebase-analyzer`) with the DEFEND preamble. Goal: know the current architecture,
state ownership, data flow, coupling, and the open architectural questions — with file:line
evidence — well enough to ask sharp questions.

## Stage 2 — Grill (exhaustive, architecture-first)

Conduct it yourself, relentlessly, one question at a time, each with a recommended answer:

- **Lead with architecture.** Boundaries, ownership, lifecycle, state, data flow, extension
  points, coupling, failure modes, migration/compatibility. These come first and get the most
  questions — the prior rework traces to skipping them.
- Then behavior, edge cases, scope, non-goals.
- Sharpen every fuzzy term. Resolve ambiguity before moving on.
- Front-load EVERYTHING. The contract is that no architectural question is left for
  implementation-time discovery.

Capture resolved terminology and decisions inline — they feed directly into the Stage 3
design spec (no separate ledger subfolder).

## Stage 3 — Design (+ Gate 1)

Synthesize the resolved interrogation into a design spec at
`<ledger>/specs/<date>-<slug>-design.md`. If the design space is wide, dispatch design
subagents to explore alternatives in parallel; otherwise synthesize directly. Either way,
**defend every load-bearing choice** per `rr-stable:defending-findings` — alternatives considered,
why this one survives, evidence cited inline.

Spec sections: problem & goals/non-goals · resolved architecture (components, contracts,
state ownership, data flow) · decisions-with-defense · migration/rollout · failure modes ·
scope locks honored · open risks.

**→ GATE 1:** Present the spec. Do not proceed to planning until the user approves.

## Stage 4 — Plan

With the spec approved, produce an implementation plan at `<ledger>/plans/<date>-<slug>.md`
via `superpowers:writing-plans` (dispatch a planning subagent or do it directly). Break into
independently-committable tasks ordered by dependency; each task names its goal, likely files,
verification command, and done-criteria. Flag any task touching scope-locked areas.

Each task in the plan must be expressible as:
- `id` (integer, 1-based)
- `title` (short label)
- `description` (what to implement, acceptance criteria)
- `deps` (list of task ids this depends on)

These fields become the `args.tasks` contract for the workflow.

## Stage 5 — Implement (pre-flight + shipped workflow)

Implementation runs via `orchestrated-run.js` (shipped with this skill — never edited per run).
The workflow handles: parallelism, escalation ladder (haiku → sonnet → opus), circuit breaker,
per-task worktree isolation, serialized integration, and final review. All per-run data
travels in `args`.

### Pre-flight (interactive, in this session)

The workflow takes no human input once running. Resolve everything now:

1. **Extract the task graph** from the plan: id, title, description, deps for each task.
2. **Create a DEDICATED integration branch — this becomes `SOURCE`.** `SOURCE` must NEVER be
   the branch the human currently has checked out: the Integrate/Final-Review/Remediation
   stages need `git worktree add <tmpdir> ${SOURCE}` to succeed, which git refuses whenever
   `SOURCE` is checked out anywhere else — including your primary worktree — and its fallback
   (push the ref back from a detached worktree) is *also* refused by git's
   `receive.denyCurrentBranch` safety. There is no working fallback once that happens, so this
   is not optional.
   - Record `BASE` = the branch the human is currently on (where their work lands at the end).
   - Compute `orch/<slug>-integration`. If it already exists (a resume), reuse it as-is —
     do NOT reset it. Otherwise create it fresh from `BASE`'s current HEAD:
     `git branch orch/<slug>-integration <BASE>` (a local ref only — no checkout, no push).
   - This branch is `SOURCE` for everything below. `BASE` is untouched until the post-run
     merge-back.
3. **Generate branch names** for each task: `orch/<slug>-task-<id>-<title-slug>` (deterministic,
   no prompting mid-run). Fork from `SOURCE` (the integration branch), same as always.
4. **Detect and resolve dependency cycles** with the user before launching.
5. **Present the graph, branch map, `SOURCE`, and `BASE`** — get explicit launch approval.

**→ GATE 2:** Explicit launch approval. After this, the run is unattended.

### Launch

```
Workflow({
  scriptPath: '<this skill's base directory>/orchestrated-run.js',
  args: {
    planPath: '<ledger>/plans/<date>-<slug>.md',
    source: 'orch/<slug>-integration',   // the DEDICATED branch from step 2 — never BASE
    tasks: {
      1: { deps: [], title: 'Task title', description: '...', branch: 'orch/<slug>-task-1-...' },
      2: { deps: [1], title: 'Task title', description: '...', branch: 'orch/<slug>-task-2-...' },
    },
    // optional: ladder (['haiku','sonnet','opus']), integrated (resume), answers (resume), finalReviewDone (resume)
  },
})
```

### Post-run (back in this session)

Read the final report. `BASE` was never touched during the run — all integrated work sits on
the `SOURCE` integration branch, so merging it back is a normal single-worktree operation here,
not a background one.

1. **If any tasks integrated** (`integrationOrder`/`integrated` non-empty): merge `SOURCE` into
   `BASE`. Try `git merge --ff-only <SOURCE>` first (the common case, since `BASE` hasn't moved);
   if `BASE` advanced during the run, fall back to a normal merge and resolve any conflicts with
   the user — never force, never guess.
2. **If Final Review has outstanding blockers** (survived remediation, or unavailable): tell the
   user before merging — the integration branch still contains every task's work regardless of
   the Final Review verdict (per-task QA already gated each one individually). Let the user
   decide whether to merge as-is and fix forward, or hold off.
3. **For each structured blocker**: grill the user, then re-launch with resolved `answers` in
   `args`, targeting the SAME `SOURCE` (do not recreate it). Resume is same-session only — pass
   `integrated` (already-merged task ids; the script also self-reconciles via git, so this is a
   safety net, not the only mechanism) and `finalReviewDone: true` if applicable.
4. **Once fully merged into `BASE`**, ask the user before deleting the integration branch
   (`git branch -d orch/<slug>-integration`) — a branch deletion is easy to undo only if nothing
   else pruned the reflog, so confirm first rather than cleaning up unasked.
5. Write the final review findings to `<ledger>/review/<date>-review.md`.

## Discipline reminders

- defending-findings applies in stages 3 and 4 — not just grilling.
- Every subagent dispatched in stages 1–4 carries the DEFEND preamble.
- Single review at the end — built into the shipped workflow's Final Review stage.
- Honor project scope locks throughout.
- Never edit `orchestrated-run.js` per run — all variation goes in `args`.
- Never target the workflow at `BASE` (the human's checked-out branch) — always the dedicated
  `SOURCE` integration branch. Merge back interactively, only after the workflow returns.
