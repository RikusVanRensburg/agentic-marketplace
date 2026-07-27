---
name: quick-issue
description: Log an already-clear idea as a well-structured GitHub issue, fast — no wayfinding, no grilling, no spec. Use when the ask is already clear in your head and you just want it on the tracker now. NOT for a fuzzy problem that needs exploring first (use core:github_create-issue for that — it interviews to find the problem) and NOT for multi-stage feature work that needs a breakdown (use rr-workshop:to-spec instead). Triggers include "log an issue for X", "quick issue", "just file this".
---

# Quick Issue

The fast path: the idea is already decided, so this skill turns it into one well-structured
GitHub issue with no ceremony — no map, no interview, no spec draft. It is deliberately the
opposite of `core:github_create-issue`, which exists to interview a *fuzzy* problem into
clarity; if the problem isn't clear yet, use that skill instead, not this one.

This skill is self-contained: it does not depend on any file belonging to another plugin.
The native-field mechanics below are its own copy, kept intentionally small.

## Steps

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
applies; otherwise omit it. **Never create a missing label** — if the repo has no `type:`/
`scope:` taxonomy at all, create without those labels and tell the user; taxonomy labels are
pre-seeded team vocabulary, never invented here.

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

**If the command exits non-zero, STOP and surface the error** — do not claim it published.
On success, **echo the issue URL** to the user.

## Red flags — STOP

- A multi-phase interview forming — that's `core:github_create-issue`'s job; ask only for
  what's missing, once.
- A body with more than the three sections — no root-cause analysis, no affected-files list,
  no wayfinding ceremony. That's what makes this the fast path.
- Creating a `type:`/`scope:` label that doesn't already exist.
- Reaching into another plugin's file for mechanics this skill already carries itself.

## Done when

- [ ] The issue exists with exactly the three-section body.
- [ ] Assignee and native type (when the org has one configured) are set.
- [ ] The `type:`/`scope:` labels used already existed in the repo, or their absence was
      surfaced to the user.
- [ ] The issue URL was echoed to the user.
