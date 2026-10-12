# Resolve and consolidate

Reached from [issue-triage](SKILL.md) step 4 with a survivor and a loser named.

1. **Preserve content** — read the loser's body and comments; append whatever the survivor
   doesn't already cover as a comment on it:
   `gh issue comment <survivor> --body "..."`
2. **Cross-link** — comment on each issue naming the other by number and title.
3. **Label the loser** — run `gh label list` and apply the label only if a `duplicate` label is
   already there: `gh issue edit <loser> --add-label duplicate`. Where the repo has no such
   label, skip this action and carry on.
4. **Close the loser** — `gh issue close <loser> --reason "not planned" --comment "Duplicate of
   #<survivor> (<survivor title>) — consolidated per the choice above."`

If an action fails, stop at that action and surface the error alongside the actions that did
complete: a partial consolidation is reported as partial.

**Done when** all four actions have succeeded, or a failure is surfaced naming which of the
four completed.
