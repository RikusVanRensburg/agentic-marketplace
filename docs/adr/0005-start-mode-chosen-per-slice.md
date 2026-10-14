# Choose each slice's starting model in pre-flight

The orchestrator mod runs each slice on one of two ladders, both defined in config: **sonnet-first** (sonnet, sonnet at higher effort, opus) and **haiku-first** (haiku at high effort, then sonnet, then opus). The pre-flight agent picks the ladder per slice, before launch. Haiku-first is for slices whose brief can name the exact files and symbols and whose work is mechanical; anything that needs design judgment starts on sonnet. The reason is cost. Haiku is cheap per token, but a haiku attempt that QA rejects still costs its tokens, a QA round and the time, and a slice that was never going to fit haiku pays all of that before sonnet starts. Starting it on sonnet is cheaper than the rework.

This partly reverses ADR 0001, which rejected predicting a tier per issue. The ladder stays reactive: a QA rejection still climbs one rung, the top rung still trips the breaker, and issues still carry no model labels. What is predicted is only the starting rung, and only between two ladders.

## Considered options

- **One ladder per run.** Simpler, and the round log compares runs cleanly. Rejected: one run mixes mechanical and design-heavy slices, and a run-wide haiku-first pays the rework on every design-heavy slice.
- **A selector agent per issue** (ADR 0001's deferred design). Rejected: it adds an agent and a label contract for a choice the pre-flight agent already has the context to make.
- **Per-slice choice in pre-flight (chosen).** Above.

## Consequences

- A haiku-first slice needs a strict brief: the goal in one sentence, the files and symbols in and out of scope, checkable acceptance criteria, the exact build and test commands, and the definition of done. The mod refuses a launch where a haiku-first slice is missing any of them, before any agent starts.
- When sonnet takes over from haiku, config decides whether it continues on haiku's branch with QA's defects or starts fresh.
- Every round is logged with the slice's mode, rung, model, effort, tokens, verdict and time. That log is the evidence for revising the pre-flight guidance, or this decision.
