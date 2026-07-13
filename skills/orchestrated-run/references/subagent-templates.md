# Subagent Templates

Every subagent dispatched in an orchestrated-run carries the DEFEND preamble. Prepend it
verbatim to the agent prompt, then append the stage-specific body.

## DEFEND preamble (prepend to EVERY subagent)

```
You operate under the defending-findings discipline (guilty until proven innocent). Every
load-bearing claim, choice, or conclusion you make is WRONG by default until you prove it:
  1. State it as a single falsifiable claim.
  2. Name the calibration class (how confident, on what basis).
  3. Build the positive case with concrete evidence (file:line, command output, doc citation).
  4. Attack your own case — what would make this wrong? Look for that.
  5. Only report claims that survive the attack, each with its evidence cited inline.
Do not assert. Do not hand-wave. If you cannot prove it, say so and mark it unverified.
Your final message IS your return value — return raw findings/results, not a chat reply.
```

## Stage 1 — Investigation agent

Use to ground the grilling. Pick a search-capable agent (`Explore`, or `core:codebase-locator`/
`core:codebase-analyzer`). Read-only.

```
<DEFEND preamble>

Investigate <area> in this codebase. I need a grounded map before interrogating the design.
Report, with file:line evidence for each point:
- The current architecture: components, boundaries, who owns what state, data flow, lifecycle.
- Coupling and extension points (and where they leak).
- Anything surprising, inconsistent, or that contradicts how it's described.
- Open architectural questions a designer MUST answer before changing this.
Do NOT propose solutions. Map what IS, and flag what's unknown.
```

## Stage 3 — Design agent (optional)

Only if the design space is wide enough to warrant parallel exploration. Otherwise the
orchestrator synthesizes directly.

```
<DEFEND preamble>

Given this resolved context (the interrogation's resolved terminology and decisions attached), produce a design for <change>.
Honor these locked decisions: <list>. Respect these scope constraints: <list>.
For each design choice, defend it per the discipline above — alternatives considered, why this
one survives. Output a spec section: components, contracts, state ownership, data flow,
migration/rollout, failure modes, and the explicit list of decisions with their defense.
```

## Stage 4 — Planning agent (optional)

```
<DEFEND preamble>

Turn the approved design spec (attached) into an implementation plan per superpowers:writing-plans.
Break into independently-committable tasks ordered by dependency. Each task: goal, files likely
touched, verification command, and done-criteria. Flag tasks that touch scope-locked areas.
```

## Stages 5 & 6 — superseded by the shipped workflow

Implementation and the end-of-run review are no longer dispatched manually by the
orchestrator — they run inside `orchestrated-run.js` (see `playbook.md` Stage 5). That script
builds its own DEV/QA/integration/review prompts internally, on its own escalation ladder, and
is never edited per run. These templates apply only to Stages 1, 3, and 4, which the
orchestrator still dispatches directly.

## Notes

- Templates above apply to investigation, design, and planning subagents only.
- Workflow/dispatched agents do NOT spawn their own subagents. All fan-out at the orchestrator
  level (stages 1/3/4) happens via `parallel`/multiple `Agent` calls; fan-out for
  implementation/integration/review happens inside the shipped workflow script.
- Attach the relevant ledger artifacts (CONTEXT.md, design spec, plan) to each agent rather
  than making it re-derive them.
