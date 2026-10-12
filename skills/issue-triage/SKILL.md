---
name: issue-triage
description: Use when asked to triage a GitHub issue for duplicates already on the tracker — "triage #142", "is this a dup?".
---

# Issue Triage

One issue in; a verdict on whether the tracker already holds a genuine duplicate of it, and —
for a genuine duplicate — one consolidated issue in place of two open ones.

**Standing rule:** "these two are duplicates" is a finding, so `rr-workshop:defending-findings`
applies — the claim is guilty until proven innocent. What convicts is the same underlying
request or bug; matching wording is circumstantial.

## 1. Get the target issue

Take the issue number from the ask; if none was given, ask for one. Then read it:

```bash
gh issue view <n> --json number,title,body,state
```

**Done when** the target's title and body are in hand.

## 2. Search for candidates

Search the tracker once per term-set, across open and closed issues:

```bash
gh issue list --state all --limit 30 --json number,title,state --search '<terms>'
```

The term-sets:

1. The salient noun phrases from the target — the words naming the actual request or bug.
2. A distinct alternate phrasing of the same thing — a synonym for the main noun, or the
   user-facing symptom in place of the technical cause.
3. The literal error text or exact UI string, if the target quotes one.

Drop the target's own number from the results.

**Done when** term-sets 1 and 2 have both run, term-set 3 has run if the target quotes a
literal string, and every distinct candidate returned has had its full body read.

## 3. Judge the strongest candidate as a defended finding

Build the positive case that the strongest candidate and the target describe the *same*
underlying request or bug. Then attack that case: two people independently hitting
similar-sounding but distinct problems; a detail in one that the other contradicts; one shared
symptom with two different causes. The claim stands only if it survives, cited with the
specific evidence that forces it.

Land on exactly one verdict:

- **Confident duplicate** — the case survived attack. Continue to the survivor gate (step 4).
- **Confident non-duplicate** — no candidate's case survived. Report each candidate considered
  and the evidence that killed it. The run ends here.
- **Ambiguous** — evidence cuts both ways and neither reading wins. "Basically the same" and
  "close enough" land here; they are ambiguous, not confident. Put the target and the closest
  candidate side by side for the user with the case for and the case against, and leave both
  issues as they are. The run ends here.

**Done when** one verdict is stated, every candidate from step 2 is accounted for by it, and —
for a confident duplicate — both the surviving evidence and the counter-reading that failed
are written down.

## 4. Survivor gate — confident duplicate only

Put the choice to the user and wait for the answer. Show both issues' titles and step 3's
evidence: the evidence that convinced this skill is what the user needs in order to confirm or
overturn it. Three options:

- **Keep the target** — the issue this skill was invoked on survives.
- **Keep the candidate** — the existing issue survives.
- **Reject** — not duplicates after all; both stay open exactly as they are.

The survivor gate is passed by an explicit answer arriving in a later turn. Until it arrives,
the tracker stays exactly as step 1 found it.

| The excuse, under pressure | What actually holds |
|---|---|
| "The wording match is obvious — this one's safe to just close." | Matching wording is the circumstantial evidence the standing rule already discounts, and this is the one irreversible action in the run. |
| "I'll ask and consolidate in the same message, so the user sees the result." | Then the gate never existed — the commands ran before an answer could arrive. Post the question and end the turn. |
| "They said 'triage this and clean it up' — that's authorisation." | The invocation authorises the investigation. Which of two issues carries the team's history is a separate decision, and theirs. |
| "It's obvious which survives — the older one / the one with more detail / the one with the repro." | Each of those is an automatic rule standing in for the gate. The user may be keeping the thin one because it is the one their customer is subscribed to. |
| "I'm confident, and closing is reversible if I'm wrong." | Reopening restores the state, not the routing: the loser's watchers were already notified, and the survivor now carries a cross-link to a duplicate that wasn't one. |
| "The candidate is already closed, so nothing is really at stake." | Then the target is the issue about to be closed — the live one somebody is waiting on. |

**Reject** → report that the duplicate claim was rejected, and stop; nothing changes.

**A survivor named** → the other issue is the loser. Consolidate the pair:
[resolve-and-consolidate.md](resolve-and-consolidate.md).

**Done when** either the rejection is reported, or a survivor and loser are named and
consolidation has finished.
