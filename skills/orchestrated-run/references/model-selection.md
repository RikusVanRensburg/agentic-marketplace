# Model Selection

This applies to subagents the orchestrator dispatches directly — Stages 1, 3, and 4
(investigation, design, planning). Bias toward capability for anything reasoning-heavy or
load-bearing; bias toward speed/cost only for mechanical breadth work.

Stages 5 and 6 (implementation, integration, final review) run inside the shipped
`orchestrated-run.js` workflow, which owns its own model choices: DEV climbs an escalation
ladder (default haiku → sonnet → opus), QA and the final review are pinned to opus, and
integration runs on sonnet. Override the ladder via `args.ladder` at launch time — do not hand
those subagents a model choice from this file.

## Heuristic

| Task shape | Model | Why |
|---|---|---|
| Architecture analysis, design synthesis, root-cause reasoning, judging trade-offs | **Opus** | Load-bearing reasoning where a wrong call compounds. This is exactly where under-specification bit last time. |
| Planning, writing the spec | **Opus** (or Sonnet if the task is well-scoped and mechanical) | Most planning carries real design choices that must be defended. |
| Broad codebase search/locate, mechanical refactors, gathering file inventories, simple well-specified edits | **Sonnet** | Fast, capable enough for breadth and mechanical work. |
| Pure pattern-matching, large-volume low-judgment scans | **Haiku** | Cheapest for high-volume, low-stakes passes. |
| Unsure | inherit session model | Don't guess down. Default up, not down, for anything load-bearing. |

## Rules of thumb

- **Never downgrade architecture/design reasoning.** The whole skill exists because that was skimped.
- A task that requires *defending* choices (per defending-findings) is by definition not
  mechanical — lean Opus.
- Parallelize breadth (many Sonnet/Haiku searchers) but keep synthesis on one strong model.
- State the model choice and a one-line reason when dispatching, so it's auditable.
