---
name: quick-issue
description: Use when the ask is already clear and just needs filing as a GitHub issue — "log an issue for X", "quick issue", "just file this" — or when an existing issue is thin and needs fleshing out in place — "populate #N", "flesh out #N". For a problem that still needs exploring use core:github_create-issue; for duplicate-checking, github-issues:issue-triage.
---

# Quick Issue

The **fast path**: the thinking is already done, so this is transcription. Two modes landing on
the same shape — given an issue number, run Mode B; otherwise Mode A.

## The shape

Every issue this skill touches ends with exactly these three sections — no more:

```markdown
## Problem

<what's wrong or wanted, from the user's perspective>

## Context

<why it matters; anything relevant already known>

## Acceptance criteria

- [ ] <concrete, checkable outcome>
```

Fill them from what the user or the issue already says, plus whatever a file or component it
names tells you when you read it. Ready to render when all three can be written **without
guessing**; if something is still missing, ask for it in one round, then write.

## The native fields

Three fields ride alongside the body in both modes.

**Labels — drawn from the repo's own taxonomy:**

```bash
gh label list --limit 200 --json name
```

Pick from what that command returned: the `type:`-family value whose *meaning* fits (new
capability, bug fix, or upkeep — the literal strings vary by repo), plus a `scope:`-family
value if one clearly applies. The taxonomy is pre-seeded team vocabulary, so if a family is
absent from the list, file without it and tell the user.

**Native issue type — a separate, coarser field from the `type:` label; set both.** Map by
meaning: new capability → `Feature`, bug fix → `Bug`, everything else (restructuring,
housekeeping, docs) → `Task`. Check `gh api orgs/{owner}/issue-types` if unsure the org has
issue types configured; if it 404s or returns nothing, omit `--type`.

**Assignee — `@me`.**

## Mode A — file a new issue

```bash
gh issue create --title "<title>" --body-file <local-draft>.md \
  --label "<type-label>" --label "<scope-label>" \
  --assignee @me --type "<native-type>"
```

Drop any flag the repo or org doesn't support. Report success by echoing the issue URL the
command printed; on a non-zero exit, stop and report the error verbatim.

## Mode B — flesh out an existing issue

Everything already on the issue **survives**: the body is rewritten into the shape with the
existing text folded into the section it belongs in, and each native field is filled only where
it is currently blank.

1. Fetch the target, asking for the number if none was given:

   ```bash
   gh issue view <n> --json number,title,body,labels,assignees,type,state
   ```

2. Read the sparse title and body, plus any file or component its text names, until the shape
   can be written without guessing.

3. Rewrite the body in place:

   ```bash
   gh issue edit <n> --body-file <local-draft>.md
   ```

4. Fill blanks, judged against the JSON from step 1:

   - `assignees` empty → `gh issue edit <n> --add-assignee @me`
   - no label from a family → add that family's label
   - `.type` is `null` → `gh issue edit <n> --type "<native-type>"`

On a non-zero exit from any edit, stop and report the error verbatim. Otherwise report, field
by field, what you filled and what was already there.

## Done when

- [ ] The body is exactly the three sections of the shape, every acceptance criterion a
      concrete checkable outcome.
- [ ] Labels, native type and assignee are each either set on the issue, or their absence
      explained to the user (family missing from the taxonomy, org has no issue types).
- [ ] **Mode A** — the URL `gh issue create` printed was echoed to the user.
- [ ] **Mode B** — the prior body text survives inside the new shape, and each of `assignees`,
      the `type:`/`scope:` labels and `.type` was reported as either filled now or already
      present.
