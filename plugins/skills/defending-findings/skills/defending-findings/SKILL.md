---
name: defending-findings
description: 'Guilty until proven innocent for findings. Use when producing a finding, and before acting on, citing, or summarizing one. Triggers include "I found", "the bug is", "the root cause", "therefore", "so it must be". Other skills, such as issue-triage, reach for it as their standing rule on findings.'
---

# Defending Findings

Every finding **is guilty** until it proves otherwise. The agent builds a positive case, attacks that case, and cites the surviving evidence inline. No surviving case, no finding.

**Guilty until proven innocent.** Not "potentially guilty". Guilty.

## What counts as a finding

A claim is a finding when it is **all three**:

- **Derived** — concluded, not read off the screen.
- **Action-relevant** — a next step depends on it.
- **Non-trivial to verify** — a fresh reader cannot confirm it without redoing the work.

Findings arrive in five shapes:

- **Causal** — "X causes Y", "the bug is in Z", "this fails because…"
- **State** — "the API returns Z when the cache is cold", "this behaviour lives in module Y, not where the docs say"
- **Synthesis** — "the codebase does X", "the pattern here is Y"
- **Decision / recommendation** — "pick library A", "implement this as B"
- **Correctness** — "this is safe", "the test covers it", "this dependency is fine"

Observations fail the three-part test and need no defense: reading a file the user pointed to, quoting a command's raw output, restating what the user said verbatim. An inference *from* what the user said ("so the requirement implies…") is a derived state claim about intent, and gets the defense.

## The defense

Before acting on, citing, or moving past a finding:

1. **State the finding as a single falsifiable claim.** Precise enough to be wrong. "X is broken" → "X returns null when called with empty input, foo.ts:42".
2. **Verdict: guilty.** The finding is wrong. To overturn it, build the case.
3. **Calibrate** — stakes × direction (§Calibration) fixes how many attacks step 5 must survive and the standard of proof they must meet.
4. **Build the positive case.** Cite specific evidence — file:line, command output, observed behaviour — that forces acceptance.
5. **Attack the case.** Go after every **load-bearing** cited piece — one the claim fails without. Is the file stale? Did the grep miss a path? Is the behaviour coincidental? Is there a sibling case that contradicts, or an alternative explanation that fits the same evidence? Name the attacks, then run them, to the count calibration demands.
6. **Survives** — every attack named in step 5 was run and none broke a cited piece → accept, and cite the surviving evidence inline. The finding ships with its proof attached.
7. **Fails** — the finding stays guilty, in quarantine. No defense → no recommendation, no fix, no summary. Retract, refine, or keep investigating. If investigation is exhausted with no survivor, report that explicitly: the strongest falsified candidates, the attack that killed each, and the specific evidence that would settle the question. A defended "unknown" is a valid deliverable; a hedged dead finding is not.

## Calibration: stakes and direction

The defense runs on every finding. What calibration sets is how many attacks a finding must survive, and the standard of proof they must meet.

**Stakes axis — how hard the finding is to undo:**

| Stakes | Examples | Required intensity |
|---|---|---|
| **High** | Library / framework / architecture / data model / migration / API shape / security posture | Two independent attacks per load-bearing cited piece, from distinct vectors (staleness, missed path, coincidence, a contradicting sibling case, an alternative explanation). |
| **Medium** | Implementation approach inside a module, naming a public function | One survived attack per load-bearing cited piece. |
| **Low** | Cosmetic refactor, typo fix, local rename | One survived attack, on the single cited check the claim rests on. |

**Direction axis — what the finding asserts:**

| Direction | Examples | Standard of proof |
|---|---|---|
| **Correctness / safety / done-right** | "This code is safe", "this dependency is fine", "the test covers it" — and every endorsement of a library, framework, architecture, or approach, since endorsing is itself a correctness claim | Beyond reasonable doubt. A false positive ships broken code — when the direction is unclear, presume fault. |
| **Fault / brokenness / risk** | "This is a bug", "this query is N+1", "this won't handle X" | A preponderance of evidence. A failed attack costs one review cycle, not production. |

**Combination rule:** when the two axes disagree, the stricter one wins. A low-stakes correctness finding ("this typo fix is safe") never drops below one survived attack per load-bearing cited piece.

**Calibration compresses the defense; it never waives it.** Even a low-stakes fault finding still gets stated, verdicted, attacked once, and cited — compression means fewer attacks, not none.

## Rationalizations and red flags — state, attack, cite

If any signal below appears, the agent is about to skip the defense. Stop; take the positive move.

| Signal | Positive move |
|---|---|
| "I already saw the evidence — re-checking is wasteful" / "Based on my analysis" (no citations) | Seeing isn't defending. State the case and cite file:line. |
| "Nothing contradicted it when I looked" | Absence of contradiction isn't proof. Run the positive check — the burden is on the finding. |
| "I'm experienced; my hypothesis is usually right" | Experience makes hypotheses fast, not correct. Run the defense anyway. |
| "We're under time pressure — defend later" / "Action beats analysis" / "Let's just ship it" / "We can verify later" | Verification IS the analysis. Defend now — the 30-second check is cheaper than the rollback. |
| "It's simple" / "Low stakes — skip it" / "The user said don't overthink it" / a bare answer with no structure | Framing compresses the defense per §Calibration; it never waives it. State, verdict, one cited check that survives one attack, cite. |
| "The evidence is overwhelming — attacking it would be theatre" / "The case is airtight" | An airtight case is the cheapest one to attack, so attack it: name a vector and run it. Steps 1–4 cost nothing; step 5 is where the finding is earned. Unattacked evidence is unattacked however much of it there is. |
| "The subagent already defended it — its report is full of citations" | Those citations are the subagent's case, not your attack on it. Open one cited file:line yourself and run one vector against it before the finding travels further. |
| "I already asserted this earlier in the session" | An earlier assertion is a claim, not a defense. If it was defended then, re-cite that evidence inline now; if it wasn't, defend it before it carries more weight. |
| "Two sources said the same thing" | Corroboration isn't survival. Attack each cited piece regardless of count. |
| "I considered alternatives; none held" | Name each alternative and the specific attack that killed it — considering isn't attacking. |
| "The user already agrees with the finding" | The user isn't evidence. Defend against the codebase, not social consensus. |
| "This is a fault finding, so the bar is low" | Lower, not gone. State, one survived attack per load-bearing cited piece, cite. |
| "I'm just choosing a library; we can swap it later" | Library and framework choices are high stakes *and* correctness direction: two independent attacks per load-bearing cited piece, before the choice, not after. |
| "Everything else has been ruled out — must be the cause" / "The prime suspect" / "Has to be X" | Exclusion isn't proof. Run the direct positive check on the surviving candidate. |
| "Obviously" / "clearly" / "must be" (no citation) | State the falsifiable claim and cite the evidence behind it. |
| Hedge words ("probably", "likely", "I think") attached to a shipped finding | Either defend and assert, or keep it explicitly in quarantine, labeled a hypothesis with the check that would resolve it. |
| A fix or recommendation taking shape before the claim is stated and attacked | State the falsifiable claim first, defend it, and let the fix follow the defended finding. |
| Synthesis across files treated as load-bearing | Attack the join between the files specifically before citing it. |
