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

Three fields ride alongside the body in both modes. The `issues` mod sets them and checks they
landed, so this skill only picks the values. Call its `issue_labels` tool first: it lists the
repo's labels by family, the org's native issue types and the milestones.

**Labels, from the repo's own taxonomy.** Pick the `type:`-family value whose *meaning* fits (new
capability, bug fix, or upkeep; the literal strings vary by repo), plus a `scope:`-family value if
one clearly applies. The taxonomy is pre-seeded team vocabulary, so if a family is absent, file
without it and tell the user.

**Native issue type, a separate, coarser field from the `type:` label; set both.** Map by
meaning: new capability → `Feature`, bug fix → `Bug`, everything else (restructuring,
housekeeping, docs) → `Task`. When `issue_labels` says the org has none, leave it off.

**Assignee: `@me`.**

## Mode A: file a new issue

Call `issue_create` with the title, the body, the labels, the native type and `assignee: "@me"`.
Report success by echoing the issue URL it returns. On an error, stop and report it verbatim: it
names what did not land.

## Mode B: flesh out an existing issue

Everything already on the issue **survives**: the body is rewritten into the shape with the
existing text folded into the section it belongs in, and each native field is filled only where
it is currently blank.

1. Read the target, asking for the number if none was given:

   ```bash
   gh issue view <n> --json number,title,body,labels,assignees,type,state
   ```

2. Read the sparse title and body, plus any file or component its text names, until the shape
   can be written without guessing.

3. Call `issue_fill` with the number, the rewritten body, the labels, the native type and
   `assignee: "@me"`. It fills only what is blank and leaves what is there.

On an error, stop and report it verbatim. Otherwise relay its report, field by field: what it
filled and what was already there.

## Done when

- [ ] The body is exactly the three sections of the shape, every acceptance criterion a
      concrete checkable outcome.
- [ ] Labels, native type and assignee are each either set on the issue, or their absence
      explained to the user (family missing from the taxonomy, org has no issue types).
- [ ] **Mode A** — the URL `issue_create` returned was echoed to the user.
- [ ] **Mode B** — the prior body text survives inside the new shape, and each of `assignees`,
      the `type:`/`scope:` labels and `.type` was reported as either filled now or already
      present.
