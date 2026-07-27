---
name: issue-triage
description: Investigate a GitHub issue for duplicates already in the tracker, and consolidate if a genuine one is found. Manually invoked, pointed at a specific issue — not triggered by webhooks or events. Use when asked to triage, dedup, or check an issue for duplicates, e.g. "triage issue #142", "is this a duplicate?", "check #142 against the tracker".
---

# Issue Triage

Given one issue, find out whether the tracker already holds a genuine duplicate of it. Invoked
manually against a specific issue — this skill does not listen for GitHub events; it is a
Claude Code skill, not a webhook handler.

**Standing rule:** whether a candidate is a genuine duplicate is a finding —
`rr-workshop:defending-findings` applies. Superficial wording overlap is not evidence of a
duplicate; the same underlying request or bug is.

## Steps

### 1. Gather the target issue

If no issue number or URL was given, ask for one before continuing. Fetch its title and body:

```bash
gh issue view <n> --json number,title,body,state
```

### 2. Search for candidates

Extract the salient terms from the target's title and body (the noun phrases describing the
actual request or bug, not incidental words), then search the tracker's other open issues:

```bash
gh api -X GET search/issues -f q='repo:{owner}/{repo} is:issue is:open <salient terms>' --jq '.items[] | {number, title}'
```

Exclude the target issue itself from its own candidate list. Read each candidate's full body,
not just its title — a title alone is not enough evidence either way.

### 3. Judge each candidate as a defended finding

For the strongest candidate (if any): build the positive case that it describes the *same*
underlying request or bug as the target — not merely similar words, the same problem or ask —
then attack that case (could this be two different people independently hitting a similar-
sounding but distinct issue? does one mention a detail the other contradicts?). The claim only
stands if it survives that attack, cited with the specific evidence that forces it.

Reach one of three verdicts:

- **Confident duplicate** — the case survives attack, cited with its evidence. This verdict is
  a defended finding, ready for a consolidation step to act on.
- **Confident non-duplicate** — no candidate's case survives attack. Report which candidates
  were considered and the specific evidence that killed each. No further action.
- **Ambiguous** — evidence exists on both sides and neither reading clearly wins. Report the
  target and the closest candidate side by side, with the case for and against each — for a
  human (or a later step) to review. No automatic action either way.

**This skill does not modify, comment on, label, or close any issue** — it only searches and
judges. Reporting the verdict, with its evidence, is the complete deliverable.

## Red flags — STOP

- Treating superficial wording overlap as sufficient evidence of a duplicate.
- A verdict without cited evidence for whichever way it goes.
- Modifying, commenting on, labeling, or closing any issue — this skill only investigates.
- Listening for or reacting to a webhook/event — this skill is invoked, never triggered.

## Done when

- [ ] The target issue's title and body were read, and candidates were searched from its
      salient terms — not just its title.
- [ ] A confident duplicate verdict cites the specific evidence that survived attack.
- [ ] A confident non-duplicate verdict names its candidates and the evidence that killed each.
- [ ] An ambiguous verdict presents both sides rather than picking one.
- [ ] No issue anywhere was modified, commented on, labeled, or closed.
