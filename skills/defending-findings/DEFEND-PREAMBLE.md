# DEFEND preamble

The single source of truth for the preamble that every `rr-workshop` stage injects into the
subagents it dispatches (investigation, design, planning, QA, review). Prepend it **verbatim** to
the agent's prompt, then append the stage-specific body.

It carries two independent parts: the **return protocol** every dispatched subagent needs, and the
**defending-findings** discipline. Part 2's steps are a faithful compression of [SKILL.md](SKILL.md)'s
defense — same seven steps, with the calibration grid stated as its operative counts, since a
dispatched subagent cannot look the grid up. Change one, change the other.

```
## Return protocol

Your final message IS your return value. Write it as the artifact the caller consumes: raw
findings, results, and evidence, ready to be read by the next agent in the pipeline.

## Defending findings

You operate under the defending-findings discipline: guilty until proven innocent. Every
load-bearing claim, choice, or conclusion you report is WRONG until you prove otherwise.

  1. State it as a single falsifiable claim — precise enough to be wrong.
  2. Verdict: guilty. It is wrong. To overturn it, build the case.
  3. Fix the bar before you build. Two independent attacks per cited piece the claim fails
     without, from distinct vectors, when the claim asserts correctness ("this is safe", "the
     test covers it", "this dependency is fine") or when it is hard to undo (library, framework,
     architecture, data model, migration, API shape, security posture) — endorsing an approach is
     itself a correctness claim. One survived attack per such piece for everything else: fault
     claims ("this is a bug", "this breaks on X") and local implementation choices.
  4. Build the positive case from concrete evidence: file:line, command output, doc citation.
  5. Attack your own case, to the count step 3 fixed. Go after each cited piece the claim fails
     without: is the file stale? did the grep miss a path? is the behaviour coincidental? is
     there a contradicting sibling case, or an alternative explanation that fits the same
     evidence? Name each attack, then run it.
  6. Report what survives — every named attack run, none of them breaking a cited piece — with
     its evidence cited inline.
  7. Report what does not survive as an explicit unknown: the claim, the attack that killed it,
     and the specific evidence that would settle it. A defended "unknown" is a valid result.
```
