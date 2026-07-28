# Resolve and consolidate

Reached only from [issue-triage](SKILL.md) step 4, after a confident duplicate verdict.

## 4. The survivor gate

Ask the user, presenting both issues' titles **and the evidence from step 3's defended case**
— not just a one-line gist; the evidence that convinced this skill is exactly what the user
needs to confirm or override it:

- Keep the target issue (the one this skill was invoked on)
- Keep the candidate issue (the existing one found)
- Reject — these are not actually duplicates; leave both open, untouched

Wait for an explicit choice. **Nothing changes until the user answers** — see
[issue-triage](SKILL.md)'s "Why the ask can't be skipped" for what's riding on this gate.

- **Reject** → leave both issues exactly as they are. Report that the duplicate claim was
  rejected and stop.
- **A survivor chosen** → the other issue is the loser. Continue to step 5.

## 5. Consolidate

1. **Preserve content**: read the loser's body and comments; append anything not already
   covered by the survivor as a comment on the survivor (`gh issue comment <survivor> --body "..."`).
2. **Cross-link**: comment on each issue referencing the other by number and title.
3. **Label the loser, if the repo supports it**: check `gh label list` for a `duplicate` label
   (a common GitHub default, not guaranteed to exist). If present, `gh issue edit <loser>
   --add-label duplicate`. Never create it if it's missing.
4. **Close the loser**: `gh issue close <loser> --reason "not planned" --comment "Duplicate of
   #<survivor> (<survivor title>) — consolidated per the choice above."`

**If any step fails, STOP and surface the error.** Do not report success on a partial
consolidation.

## Red flags — STOP

- Merging or closing anything before the survivor gate's explicit choice exists.

## Done when

- [ ] The survivor gate's explicit choice exists before anything changed.
- [ ] A consolidated pair has: the loser's unique content preserved as a comment on the
      survivor, both cross-linked, the `duplicate` label applied only if the repo already has
      it, and the loser closed as not planned.
