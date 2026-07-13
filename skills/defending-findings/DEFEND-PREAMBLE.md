# DEFEND preamble

The single source of truth for the defending-findings preamble that every `rr-workshop` stage
injects into the subagents it dispatches (investigation, design, planning, QA, review). Prepend
it **verbatim** to the agent's prompt, then append the stage-specific body.

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
