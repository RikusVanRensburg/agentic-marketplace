---
name: issue-triage
description: Investigate a GitHub issue for duplicates already in the tracker, and consolidate if a genuine one is found. Manually invoked, pointed at a specific issue — not triggered by webhooks or events. Use when asked to triage, dedup, or check an issue for duplicates, e.g. "triage issue #142", "is this a duplicate?", "check #142 against the tracker".
---

# Issue Triage

Given one issue, find out whether the tracker already holds a genuine duplicate of it, and if
so consolidate rather than leave both sitting open. Invoked manually against a specific issue
— this skill does not listen for GitHub events; it is a Claude Code skill, not a webhook
handler.

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

- **Confident duplicate** — the case survives attack, cited with its evidence. Proceed to
  step 4 — resolve the survivor with the user, then consolidate.
- **Confident non-duplicate** — no candidate's case survives attack. Report which candidates
  were considered and the specific evidence that killed each. **Stop here — no further action.**
- **Ambiguous** — evidence exists on both sides and neither reading clearly wins. Surface the
  target and the closest candidate side by side to the user for full review, explicitly
  presenting the case for and against rather than picking one. **Stop here — no automatic
  action either way.**

### 4. Resolve the survivor with the user — only for a confident duplicate

Ask the user, presenting both issues' titles and a one-line gist of each:

- Keep the target issue (the one this skill was invoked on)
- Keep the candidate issue (the existing one found)
- Reject — these are not actually duplicates; leave both open, untouched

Wait for an explicit choice. **Nothing changes until the user answers.**

- **Reject** → leave both issues exactly as they are. Report that the duplicate claim was
  rejected and stop.
- **A survivor chosen** → the other issue is the loser. Continue to step 5.

### 5. Consolidate

1. **Preserve content**: read the loser's body and comments; append anything not already
   covered by the survivor as a comment on the survivor (`gh issue comment <survivor> --body "..."`).
2. **Cross-link**: comment on each issue referencing the other by number and title.
3. **Label the loser, if the repo supports it**: check `gh label list` for a `duplicate` label
   (a common GitHub default, not guaranteed to exist). If present, `gh issue edit <loser>
   --add-label duplicate`. **Never create this label if it's missing** — the same rule as
   every other pre-seeded taxonomy label in this plugin family.
4. **Close the loser**: `gh issue close <loser> --reason "not planned" --comment "Duplicate of
   #<survivor> (<survivor title>) — consolidated per the choice above."`

**If any step fails, STOP and surface the error.** Do not report success on a partial
consolidation.

## Red flags — STOP

- Merging or closing anything before the user's explicit survivor choice exists.
- Treating superficial wording overlap as sufficient evidence of a duplicate.
- Creating a `duplicate` label that doesn't already exist in the target repo.
- Picking a survivor by an automatic rule (filing order, more detail, anything) instead of
  asking the user.
- An ambiguous verdict resolving itself into an automatic action instead of full human review.
- Listening for or reacting to a webhook/event — this skill is invoked, never triggered.

## Done when

- [ ] A confident duplicate always went through the user's explicit three-way choice before
      anything changed.
- [ ] A confident non-duplicate verdict named its candidates and the evidence that killed each.
- [ ] An ambiguous verdict surfaced both issues for full review instead of acting automatically.
- [ ] A consolidated pair has: the loser's unique content preserved as a comment on the
      survivor, both cross-linked, the `duplicate` label applied only if the repo already has
      it, and the loser closed as not planned.
