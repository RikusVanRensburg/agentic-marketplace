---
name: defending-findings
description: 'Use when producing any finding, conclusion, diagnosis, root-cause claim, or synthesis from investigation — and before acting on, citing, summarizing, or moving past it. Applies during code review, debugging, root-cause analysis, codebase research, architecture review, and any task whose output is built on findings. Triggers also include "I found", "the bug is", "the codebase does", "the pattern here", "the root cause", "therefore", "so it must be". Enforces a guilty-until-proven-innocent stance: every finding is wrong by default and is only promoted to accepted by an explicit positive case that survives self-attack and is cited inline.'
---

# Defending Findings

## Overview

Every finding the agent produces — conclusion, diagnosis, root-cause claim, synthesis — **is wrong** until proven otherwise. The agent builds a positive case, attacks that case, and cites surviving evidence inline. No surviving case = finding stays wrong. The agent does not coast on the original hypothesis.

**Slogan: guilty until proven innocent.** Not "potentially guilty". Guilty.

## When to use

Run the ritual when producing any of:

- **Causal claims** — "X causes Y", "the bug is in Z", "this fails because…"
- **State claims** — "X is defined in Y", "the API returns Z", "feature W lives here"
- **Synthesis claims** — "the codebase does X", "the pattern here is Y"
- **Decisions / recommendations** — "we should pick library A", "this should be implemented as B"
- **Correctness claims** — "this is safe", "the test covers it", "this dependency is fine"

## When NOT to use

These are observations, not findings:

- Reading a file the user pointed to (raw lookup)
- Running a command and quoting its raw output
- Restating what the user just said

A finding requires **all three**: *derived* (not observed), *action-relevant* (next step depends on it), *non-trivial to verify* (fresh reader cannot confirm without redoing work).

## The three rules

1. **Every finding is wrong by default.** Not "might be wrong" — wrong. Treat it as false until earned otherwise.
2. **Build the positive case. Actively.** Seek out the specific evidence that forces acceptance. Do not wait for evidence; go get it.
3. **Do not move on until you can defend it.** No defense → no recommendation, no fix, no summary. The finding stays in quarantine until proven.

## The defense ritual

Before acting on, citing, or moving past a finding:

1. **State the finding as a single falsifiable claim.** Precise enough to be wrong. "X is broken" → "X returns null when called with empty input on line 42 of foo.ts".
2. **Verdict: guilty.** The finding is wrong. To overturn, build the case.
3. **Build the positive case.** Cite specific evidence — file:line, command output, observed behaviour — that forces acceptance.
4. **Attack the case.** Try to break every cited piece. Is the file stale? Did the grep miss a path? Is the behaviour coincidental? Is there a sibling case that contradicts? Name the attacks, run them.
5. **Survives → accept and cite inline.** The finding ships with its proof attached.
6. **Fails → finding stays wrong.** Retract, refine, or keep investigating. Do not rationalize past the failure.

The ritual is a verb. The agent does not *believe* a finding; it *defended* the finding by running check Y at file:line Z.

## Calibration: stakes and direction

The ritual always runs. **What changes is the intensity of step 4 (Attack) and the number of independent attacks the finding must survive.**

**Name the calibration class out loud when defending.** Saying "this is high-stakes + correctness-direction → maximum intensity" forces the right depth of attack. Skipping this step is how findings get under-defended despite the ritual running.

**Stakes axis — how hard the finding is to undo:**

| Stakes | Examples | Required intensity |
|---|---|---|
| **High** | Library / framework / architecture / data model / migration / API shape / security posture | Multiple independent attacks. Each cited piece attacked separately. Defend hard. |
| **Medium** | Implementation approach inside a module, naming a public function | Ritual in full; one round of attack survived. |
| **Low** | Cosmetic refactor, typo fix, local rename | Ritual compressed: single cited check that survives obvious attack. |

**Direction axis — what the finding asserts:**

| Direction | Examples | Required intensity |
|---|---|---|
| **Correctness / safety / done-right** | "This code is safe", "this dependency is fine", "the test covers it" | Harsh. False positives ship broken code. Multiple corroborating attacks survived. Bias toward fault. |
| **Fault / brokenness / risk** | "This is a bug", "this query is N+1", "this won't handle X" | Ritual runs; burden lower. A failed attack costs one review cycle, not production. |

**Asymmetry rule:** Findings of *correctness* are held to a stricter standard than findings of *fault*. When in doubt, presume fault.

**Library / implementation-decision rule:** Findings that select or endorse a library, framework, architecture, or implementation approach get **maximum intensity** — they are simultaneously high-stakes and correctness-direction.

**Calibration does not waive the ritual.** Compressing on low-stakes / fault-direction findings means *fewer attacks*, not *zero attacks*. Step 1 (state), step 2 (guilty), and the final cite always run — even when the user pre-frames the work as trivial.

## Common rationalizations

| Excuse | Reality |
|---|---|
| "I already saw the evidence — re-checking is wasteful" | Seeing is not defending. State the case. Precision exposes gaps. |
| "Nothing contradicted it when I looked" | Absence of contradiction is not proof. Burden is on the finding. |
| "I'm experienced; my hypothesis is usually right" | Experience makes hypotheses fast, not correct. The discipline applies anyway. |
| "We're under time pressure — defend later" | Time pressure is when undefended findings ship and break things. Defend now. |
| "It's a simple finding" | Then defending it is simple. Run the ritual. |
| "Two sources said the same thing" | Two stale sources still corroborate. Bar is *survives attack*, not *exists in multiples*. |
| "I considered alternatives; none held" | Performative consideration is not attack. Name each alternative. Name why it failed. |
| "The user already agrees with the finding" | The user is not the evidence. Defend against the codebase, not social consensus. |
| "Low stakes — skip the ritual" | Low stakes compresses the ritual; it does not skip it. State, verdict, cite still run. |
| "This is a fault finding, so the bar is low" | The bar is *lower*, not *gone*. Fault findings still get stated, attacked once, and cited. |
| "I'm just choosing a library; we can swap it later" | Library findings are maximum intensity. "Swap later" is the rationalization that ships the wrong dependency. |
| "Action beats analysis here" / "Let's just ship it" / "We can verify later" | Verification IS the analysis. If acting feels urgent, that's exactly when undefended actions cause incidents. The 30 seconds to run a correlation check is cheaper than a rollback. |
| "Everything else has been ruled out — so this must be the cause" | Exclusion is not proof. After ruling out N candidates, the N+1th is still a hypothesis until *directly* verified. Run the positive check. |
| "The user said it's low-stakes / don't overthink it" | The user's framing is not a discipline waiver. Compress per §calibration, but always state, verdict, cite. |

## Red flags — STOP and defend

If any of these appear, the agent is about to violate. Stop. Run the ritual.

- "Obviously" / "clearly" / "must be" without cited evidence.
- "The prime suspect" / "The only remaining cause" / "Has to be X" — exclusionary framing as proof.
- "Action beats analysis" / "Let's just ship it" / "We can verify later" — verification deferral.
- Moving from finding to recommendation in one breath — no defense step between.
- "Based on my analysis" with no citations.
- Synthesis across files treated as load-bearing without checking the join.
- A fix forming before the finding has been stated as a falsifiable claim.
- Hedge words leaking in: "probably", "likely", "should", "I think". A defended finding is asserted; an undefended one stays in quarantine.
- Bare answer with no structure when the user pre-framed the task as trivial.

## Quick reference

1. Found something? → **It's wrong.**
2. State it as a falsifiable claim.
3. Name the calibration class (stakes × direction).
4. Build the positive case — cite file:line / command output / observed behaviour.
5. Attack the case — try to break each piece. For max-intensity, name alternatives and weaknesses.
6. Survives → ship with proof. Fails → stays in quarantine.
7. Compression on low-stakes is allowed; *skipping* the ritual is not.
