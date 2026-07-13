---
name: defending-findings
description: 'Guilty until proven innocent for findings. Use when producing any finding — conclusion, diagnosis, root-cause claim, or synthesis — and before acting on, citing, or summarizing it. Applies during code review, debugging, and codebase or architecture research. Triggers include "I found", "the bug is", "the root cause", "therefore", "so it must be".'
---

# Defending Findings

## Overview

Every finding the agent produces — conclusion, diagnosis, root-cause claim, synthesis — **is guilty** until it proves otherwise. The agent builds a positive case, attacks that case, and cites surviving evidence inline. No surviving case = finding stays guilty.

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
- Restating what the user just said, verbatim

An interpretation or inference from what the user said ("so the requirement implies…") is a state claim about intent, not a restatement — it gets the ritual. A finding otherwise requires **all three**: *derived* (not observed), *action-relevant* (next step depends on it), *non-trivial to verify* (fresh reader cannot confirm without redoing work).

## The three rules

1. **Every finding is guilty by default.** Treat it as false until earned otherwise.
2. **Build the positive case. Actively.** Seek out the specific evidence that forces acceptance.
3. **Do not move on until you can defend it.** No defense → no recommendation, no fix, no summary. The finding stays in quarantine until proven.

## The defense ritual

Before acting on, citing, or moving past a finding:

1. **State the finding as a single falsifiable claim.** Precise enough to be wrong. "X is broken" → "X returns null when called with empty input on line 42 of foo.ts".
2. **Verdict: guilty.** The finding is wrong. To overturn, build the case.
3. **Name the calibration class** — stakes × direction (see §Calibration below).
4. **Build the positive case.** Cite specific evidence — file:line, command output, observed behaviour — that forces acceptance.
5. **Attack the case.** Try to break every cited piece. Is the file stale? Did the grep miss a path? Is the behaviour coincidental? Is there a sibling case that contradicts? Name the attacks, run them, per the standard of proof the calibration class demands.
6. **Survives — every attack named in step 5 was run and none broke a cited piece → accept and cite inline.** The finding ships with its proof attached.
7. **Fails → the finding stays guilty, in quarantine.** Retract, refine, or keep investigating. If investigation is exhausted with no survivor, report that explicitly: list the strongest falsified candidates, the attack that killed each, and the specific evidence that would settle the question. A defended "unknown" is a valid deliverable; a hedged dead finding is not.

The ritual is a verb. The agent does not *believe* a finding; it *defended* the finding by running check Y at file:line Z.

## Calibration: stakes and direction

The ritual always runs on every finding. What changes is the standard of proof step 5 (Attack) must meet, and how many independent attacks a finding must survive.

**Stakes axis — how hard the finding is to undo:**

| Stakes | Examples | Required intensity |
|---|---|---|
| **High** | Library / framework / architecture / data model / migration / API shape / security posture | At least two independent attacks per cited piece, from distinct vectors (staleness, missed path, coincidence, a contradicting sibling case, an alternative explanation). |
| **Medium** | Implementation approach inside a module, naming a public function | Ritual in full; one round of attack survived. |
| **Low** | Cosmetic refactor, typo fix, local rename | Ritual compressed: single cited check that survives obvious attack. |

**Direction axis — what the finding asserts:**

| Direction | Examples | Standard of proof |
|---|---|---|
| **Correctness / safety / done-right** | "This code is safe", "this dependency is fine", "the test covers it" | Beyond reasonable doubt. False positives ship broken code — bias toward fault. |
| **Fault / brokenness / risk** | "This is a bug", "this query is N+1", "this won't handle X" | A preponderance of evidence. A failed attack costs one review cycle, not production. |

**Asymmetry rule:** findings of *correctness* are held to a stricter standard than findings of *fault*. When in doubt, presume fault.

**Combination rule:** when the two axes disagree, the stricter axis wins. A low-stakes/correctness-direction finding (e.g. "this typo fix is safe") never drops below one survived attack per load-bearing cited piece.

**Library / decision rule:** findings that select or endorse a library, framework, architecture, or implementation approach get **maximum intensity** — simultaneously high-stakes and correctness-direction. Every other decision or recommendation defaults to correctness-direction: endorsing an approach is itself a correctness claim.

**Calibration compresses the ritual; it never waives it.** Even a low-stakes/fault-direction finding still gets stated, verdicted, and cited — compression means fewer attacks, not none.

## Rationalizations and red flags — state, verdict, cite

If any signal below appears, the agent is about to violate the ritual. Stop; take the positive move.

| Signal | Positive move |
|---|---|
| "I already saw the evidence — re-checking is wasteful" / "Based on my analysis" (no citations) | Seeing isn't defending. State the case and cite file:line. |
| "Nothing contradicted it when I looked" | Absence of contradiction isn't proof. Run the positive check — burden is on the finding. |
| "I'm experienced; my hypothesis is usually right" | Experience makes hypotheses fast, not correct. Run the ritual anyway. |
| "We're under time pressure — defend later" / "Action beats analysis" / "Let's just ship it" / "We can verify later" | Verification IS the analysis. Defend now — the 30-second check is cheaper than the rollback. |
| "It's simple" / "Low stakes — skip it" / "The user said don't overthink it" | Framing compresses the ritual per §Calibration; it never waives it. State, verdict, one cited check, cite — always. |
| "Two sources said the same thing" | Corroboration isn't survival. Attack each cited piece regardless of count. |
| "I considered alternatives; none held" | Name each alternative and the specific attack that killed it — performative consideration isn't attack. |
| "The user already agrees with the finding" | The user isn't evidence. Defend against the codebase, not social consensus. |
| "This is a fault finding, so the bar is low" | Lower, not gone. State, attack once, cite. |
| "I'm just choosing a library; we can swap it later" | Library findings are maximum intensity. Run every attack now. |
| "Everything else has been ruled out — must be the cause" / "The prime suspect" / "Has to be X" | Exclusion isn't proof. Run the direct positive check on the N+1th candidate. |
| "Obviously" / "clearly" / "must be" (no citation) | State the falsifiable claim and cite the evidence behind it. |
| Moving from finding to recommendation in one breath | Insert the defense step — state, attack, cite — before recommending. |
| Synthesis across files treated as load-bearing | Attack the join between files specifically before citing it. |
| A fix forming before the finding is stated as falsifiable | State the claim first; let the fix follow the defended finding. |
| Hedge words ("probably", "likely", "I think") attached to a shipped finding | Either defend and assert, or keep it explicitly in quarantine, labeled as a hypothesis with the check that would resolve it. |
| Bare answer, no structure, task pre-framed as trivial | Compression is allowed; skipping state/verdict/cite is not. |
