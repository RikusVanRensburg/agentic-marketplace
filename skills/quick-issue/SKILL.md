---
name: quick-issue
description: Use when the ask is already clear and you just want it filed now, or an existing issue is thin and needs fleshing out. NOT for a fuzzy problem needing exploration (use core:github_create-issue), NOT for multi-stage work needing a breakdown (use rr-workshop:to-spec), NOT for duplicate-checking (use rr:issue-triage, only when asked). Triggers include "log an issue for X", "quick issue", "just file this", "populate issue #N", "flesh out #N".
---

# Quick Issue

No wayfinding, no grilling, no spec draft. Two entry points, both landing on the same
well-structured shape:

- **Mode A — create.** The idea is already decided; turn it into one new issue.
- **Mode B — populate.** An issue already exists but is sparse; investigate it and fill in the
  same structure in place, without creating anything new.

This skill is deliberately the opposite of `core:github_create-issue`, which exists to
interview a *fuzzy* problem into clarity — if the problem isn't clear yet, use that skill
instead of this one. It is also **not** a duplicate check: `rr:issue-triage` handles that,
invoked on its own, only when asked — neither mode here ever runs it automatically.

This skill is self-contained: it does not depend on any file belonging to another plugin.
The native-field mechanics below are its own copy, kept intentionally small.

## Mode A: create a new issue

### 1. Get the essentials

Ask only for what's genuinely missing from the conversation — a title, the **problem** (what's
wrong or wanted, from the user's perspective), the **context** (why it matters, anything
relevant already known), and **acceptance criteria** (concrete, checkable outcomes). If the
user already stated all of this, don't re-ask it as a formal interview — that's
`core:github_create-issue`'s job, not this one's.

### 2. Resolve the repo's own label taxonomy

```bash
gh label list --limit 200 --json name
```

Look for a `type:`-prefixed and a `scope:`-prefixed family. Pick the `type:` value whose
meaning fits (a new capability, a bug fix, or general upkeep — the label text varies by repo;
match by meaning, not by an assumed literal string). Pick a `scope:` value only if one clearly
applies; otherwise omit it. Only apply labels that already exist in the repo's taxonomy — if
the repo has none, create the issue without those labels and tell the user; taxonomy labels
are pre-seeded team vocabulary.

### 3. Map to native issue type

Native Issue Type is a separate, coarser field from the `type:` label (check
`gh api orgs/{owner}/issue-types` if unsure whether the org has one configured — if the
endpoint 404s or returns nothing, skip `--type` entirely). Map by meaning:

- A new capability → `Feature`
- A bug fix → `Bug`
- Anything else (restructuring, housekeeping, docs) → `Task`

This is additive to the `type:` label chosen in step 2 — set both, never one instead of the
other.

### 4. Create the issue

```bash
gh issue create --title "<title>" --body-file <local-draft>.md \
  --label "<type-label>" --label "<scope-label>" \
  --assignee @me --type "<native-type>"
```

Render the body as exactly three sections — no more:

```markdown
## Problem

<what's wrong or wanted, from the user's perspective>

## Context

<why it matters; anything relevant already known>

## Acceptance criteria

- [ ] <criterion>
- [ ] <criterion>
```

`--assignee @me` is safe here — this is a standalone issue with no parent/child tree and no
frontier depending on it staying unassigned, unlike a slice in the heavier pipeline. Omit
`--label`/`--type` flags the repo doesn't support, per steps 2-3.

**If the command exits non-zero, STOP and report the exact error.** Only report success — with
the issue URL — when the command actually exited zero.

## Mode B: populate an existing sparse issue

Given an issue number or URL instead of a fresh description. This mode **edits in place** —
it never creates a new issue, and it never checks the issue against the rest of the tracker
for duplicates (that's `rr:issue-triage`, invoked separately, only when asked).

### 1. Fetch the target issue

```bash
gh issue view <n> --json number,title,body,labels,assignees,type,state
```

If none was given, ask for one before continuing.

### 2. Investigate lightly

Read the existing (sparse) title and body. Look only at files or components the ask
explicitly names — this is **not** the multi-phase interview `core:github_create-issue` does.
Stop once Problem, Context, and at least one Acceptance Criterion can be written without
guessing; if you still can't, ask the user one direct question rather than open a second round.

### 3. Render the populated body

Same three-section shape as Mode A (`## Problem`, `## Context`, `## Acceptance criteria`).
**Preserve what's already useful** in the existing sparse text — incorporate it into the
right section rather than discarding it; expand and clarify, don't erase.

### 4. Edit in place — fill gaps only, never overwrite

```bash
gh issue edit <n> --body-file <local-draft>.md
```

Then, **only for fields that are currently empty** (check the JSON from step 1 first):

- **Assignee**: `gh issue edit <n> --add-assignee @me` only if `assignees` is empty. An
  existing assignee is left untouched — this issue may already be someone else's, or already
  deliberately assigned.
- **Labels**: add a `type:`/`scope:` label (same meaning-matching and taxonomy rules as Mode A
  step 2) only if the issue doesn't already carry one from that family. An existing label from
  either family is left as-is.
- **Native type**: `gh issue edit <n> --type "<native-type>"` (same mapping as Mode A step 3)
  only if `.type` is currently `null`.

**If any edit fails, STOP and surface the error.** Report exactly what was filled in and what
was already present and left untouched.

## Done when

- [ ] **Mode A**: the issue exists with exactly the three-section body; assignee and native
      type (when the org has one configured) are set; the `type:`/`scope:` labels used already
      existed, or their absence was surfaced to the user; the issue URL was echoed.
- [ ] **Mode B**: the target issue's body now has the three-section shape, incorporating its
      prior content; assignee/labels/native type were filled in only where empty, with existing
      values left untouched; what was filled in vs. left alone was reported to the user.
- [ ] Neither mode ran a duplicate check.
