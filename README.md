# orchestrator

Runs a multi-issue plan through subagents and ends at a verified local integration branch. The
`orchestrate` skill does the interactive pre-flight; from launch on, the mod drives the run in
code: worktrees, agents, the escalation ladders, QA, merges, verification and the tracker. It
replaces the Workflow-script engines (`flow-dev-implement-prd`, rr-workshop `orchestration`); see
ADRs 0004 and 0005.

Needs the `worktree-lifecycle` mod, which creates and later ships the integration branch.

## Install

```
/plugin install orchestrator --marketplace flow-software/flow-agentic-resources
```

## A run

1. `/orchestrate` with a GitHub PRD (an issue with sub-issues) or a plain plan. The skill reads it,
   builds the dependency graph, picks each slice's mode, writes briefs for haiku-first slices,
   settles branches and commands, and asks you everything an agent would otherwise guess.
2. On your go it calls `orchestrator_launch`. The plan is checked before any agent starts: unknown
   deps, cycles, duplicate or clashing branches, an integration branch under `orchestration/`,
   missing commands, a haiku-first slice missing any part of its brief, or two unordered slices whose
   briefs change the same files (unless `allowOverlap` is set) all refuse the launch.
3. The integration branch is created from your base and must build and pass its suite first.
4. Each slice gets a worktree at `<repo>/<branch>`, cut from the integration branch. A dev agent
   works in it; then an isolated QA agent, given only the slice, the parent and the branch, judges
   it in the same worktree after its ignored build output is cleaned. A rejection climbs the
   slice's ladder; a rejection on the top rung blocks that slice and its dependents only.
5. Slices that pass QA merge one at a time into the integration worktree, each verified with the
   build and full suite. A red suite resets. A conflict aborts and goes to a resolve agent, which
   merges the integration branch into the slice keeping both sides' acceptance criteria, then fresh
   QA checks the slice and the slices it collided with, reporting a verdict per slice that the mod
   enforces in code, before the merge is tried again (two
   rounds, then a blocker). Contradicting requirements are never resolved: they reach you as a
   blocker. The issue closes on a verified merge and the slice's worktree and branch go.
6. A final QA judges the integrated whole; its findings go to a fixer, and a fresh judge grades each
   fix.
7. Nothing is pushed. Push and PR wait for your yes, through worktree-lifecycle's ship.

## Modes and ladders

Each slice is sonnet-first or haiku-first, chosen in pre-flight. The ladders, the QA and final-QA
rungs are settings, so a newer model needs no code change:

| Setting | Default |
|---|---|
| `sonnetFirst` | `sonnet/high, sonnet/xhigh, opus/high` |
| `haikuFirst` | `haiku/high, sonnet/high, opus/high` |
| `qa` | `opus/high` |
| `finalQa` | `opus/xhigh` |
| `takeover` | `continue`: on a model change, carry on with QA's defects; `fresh` resets the worktree |
| `concurrency` | `3` slices with an agent at once |
| `qaCleanKeep` | `node_modules, packages`, kept when QA cleans |

Each rung is its own agent type (`orchestrator:<role>-<model>-<effort>`), since a plugin's spawn
takes no effort. A run keeps the settings it launched with.

## Watching it

- The pane (`/orchestrator pane`, opened on launch) and a band above the prompt.
- Blockers reach you as they happen: a toast, the status line, a message to the session, and a
  comment on the slice's issue. Unblocked chains keep going.
- `/orchestrator status | pane | retry <at> <answer> | drop <slice> | abort | take`. An answer guides
  how a slice is done and never overrides acceptance criteria; a requirements conflict is settled by
  dropping one slice, and its dependents stay halted.
- Every agent round is logged to `~/.claude/orchestrator/runs/<run>.jsonl`: slice, role, mode,
  round, model, effort, verdict, tokens and time.
- `/orchestrator stats` summarises every run's log: per start mode, how often QA passes on the
  first round, rounds to pass, tokens and dev time; per role and rung, pass rate, tokens and time.

## What its agents may not do

Whatever the permission mode or your allow rules, the mod refuses its own agents: pushing, tracker
writes, creating, switching or deleting branches and worktrees, stashing, rewriting history, and
paths outside their worktree. Your own tool calls are untouched. QA and final QA get no edit tools.

The mod approves its own spawns of its own agent types: in auto mode a plugin's spawn has no model
request for the classifier to judge, so it would otherwise be refused. The agents' own tool calls
still go through your permission mode.

A `WorktreeCreate` guard puts any agent started with `isolation: 'worktree'` inside the layout.

## Resume

The run lives in the mod's store. A reload or a new session picks it up: lost agents rerun on the
same rung, and half-done steps run again, each safe to repeat. `/orchestrator take` moves a run to
the current session.

## Known limits

- The mod answers its agents' hand-backs itself, so their final reports do not land in the session
  as messages; everything they report goes through the report tool. `/orchestrator status` counts
  the hand-backs held.
- One run at a time.
