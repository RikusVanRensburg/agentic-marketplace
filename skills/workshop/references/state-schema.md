# Workshop state.json schema

One file per run at `<scope>/.ledger/<slug>/state.json`. It is the durable resume point
for the single workshop loop. **The main session is the SOLE writer.** The Workflow script
has no filesystem access, so it never touches `state.json`; instead it *returns* a structured
summary and the main session persists that summary here. Dispatched agents never write it.

## Fields

| Field | Type | Meaning |
|---|---|---|
| `slug` | string | Sanitized task slug; names the `.ledger/<slug>/` folder. |
| `task` | string | One-line task description as the user phrased it. |
| `scope` | string | Absolute path to the resolved project root. |
| `created` | string | ISO-8601 UTC timestamp from the init script. |
| `current_stage` | string | One of `design \| plan \| implement \| verify \| review \| done`. |
| `completed_stages` | string[] | Stages finished, in order. `design` = the brainstorming+grill combo. |
| `artifacts` | object | Paths to produced files: `context`, `spec`, `plan`, `review` (null until produced). |
| `commits` | string[] | Commit SHAs created during the implement/fix stages. |
| `tasks` | object[] | The locked plan-task list `[{id,title}]` returned by the plan stage. Persisted so a resume can pass it back as `args.tasks` (the implement loop needs the full list, not just done ids). |
| `tasks_done` | string[] | Plan-task ids already implemented + passed two-stage review. Passed to the workflow as `args.tasksDone` on resume so completed tasks are skipped (no duplicate commits). |
| `status` | string | `running \| done \| blocked \| needs_attention` — mirrors the workflow's returned summary status. |
| `workflow_run_id` | string\|null | The `wf_...` id of the headless run, for same-session resume. |

## Stage lifecycle

```
design (interactive) → plan → implement → verify → review → done
```

- `design` is produced in the main session by the `superpowers:brainstorming` + `rr:grill`
  combo. On completion the main session sets `artifacts.context` + `artifacts.spec`, adds
  `design` to `completed_stages`, and advances `current_stage` to `plan`.
- `plan`, `implement`, `verify`, `review` run headless in `workflow.js`. The workflow returns
  a summary `{ status, planPath, tasksDone, commits, blockers, reviewPath, verifyEvidence }`;
  **the main session** writes it into `state.json` (sets `artifacts.plan`/`artifacts.review`,
  appends `commits`, sets `tasks_done`, sets `status`, advances `current_stage`).
- `implement` runs each task as build → spec-compliance review → code-quality review with
  bounded fix rounds; `verify` and `review` gate (loop back to fix, bounded to 2). A task that
  cannot pass review → `status: needs_attention`; exhausted verify/review loopbacks →
  `status: blocked`, with `blockers` populated.

## Resume rule

On re-invocation the skill reads `state.json` and resumes at `current_stage`:
- if `current_stage == design` → re-run the interactive combo;
- otherwise → relaunch `workflow.js` with `args.resumeStage = current_stage`, plus the locked
  `tasks` list and `args.tasksDone = state.json.tasks_done` so done tasks are skipped (same
  session: pass `resumeFromRunId = workflow_run_id`, which returns cached stages instantly).
