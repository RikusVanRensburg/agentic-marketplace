# Run the orchestration from a mod's state machine, not a Workflow script

The orchestrator mod (`plugins/mods/orchestrator`) drives a multi-issue run itself. Scheduling, the escalation ladders, the circuit breaker, integration order, git and the tracker writes are mod code; agents are spawned with `$.agent.spawn` only for the work that needs a model: dev, QA, final QA and remediation. The Workflow tool is not used. ADR 0002's point carries over unchanged: the process is shipped code, reviewed once and identical every run, and everything per run arrives as data (the plan the pre-flight skill hands to `orchestrator_launch`). What changes is where that code runs. A Workflow script holds its state in variables and has no shell, so the old scripts spent an agent on every git command, tracker read and blocker comment. A mod has `$.process` and `$.store`, so those become code, and the agents left are the ones whose output is judgment or code.

## Considered options

- **Keep the Workflow script** (`implement-prd.js`, `orchestration.js`). Rejected: the Workflow tool is a research preview that an install cannot assume is enabled (ADR 0003), and its scripts cannot touch git or the tracker except through agents.
- **A relay in model judgment** (ADR 0003). Rejected for this mod: it gives up ADR 0002's determinism, which is the reason the orchestration exists.
- **A mod engine (chosen).** Above.

## Consequences

- The engine is a reducer over state kept in `$.store`, moved forward by events (`turn.complete`, the report tool, timers). A hook runs inside a dispatch budget and a module reload restarts its variables, so a run cannot live in one long async function. The same store gives resume across reloads and sessions.
- Each agent reports through a tool the mod registers (`orchestrator_report`), schema-checked, matched to its slice by `agentId`. `turn.complete` gives the round log its tokens, duration and end reason, which also separates an infrastructure failure from a capability one.
- Effort is set per rung by registering one agent type per rung with `$.agent.register`, since `$.agent.spawn` takes no effort.
- Two platform gaps found by a spike on CLI 2.1.295, and how the mod meets them:
  - In auto mode a plugin's spawn is refused, because the classifier has no model request to judge. The mod's own `tool.check` hook approves the `Agent` tool when the mod itself raised it for one of its own types, and nothing else. The agents' own tool calls still go through the mode's checks.
  - The `cwd` given to `$.agent.spawn` is dropped. The mod's `agent.spawn` hook sets each agent's worktree as its `cwd`.
- Because the person's settings may allow `git push` outright, the mod refuses its agents' pushes, tracker writes, branch or worktree deletion and any path outside their own worktree in a `tool.call` hook. Those actions are the mod's alone.
- Each role's agent type carries a tools allowlist, so an agent cannot reach session tools it has no use for.
- The run ends at a verified local integration branch. Pushing it is the worktree-lifecycle mod's `ship`, which waits for the person's press.
