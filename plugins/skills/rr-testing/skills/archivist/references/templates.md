# Ledger document templates — sanctioned formats

These are the **sanctioned formats** the Constitution refers to. The Archivist is the
sole writer and writes every doc in these shapes. Foreign agents must not invent their
own. Keep prose terse; lead with structure; never pad.

## Universal frontmatter

Every doc begins with YAML frontmatter:

```yaml
---
scope: <scope-slug>
type: manifest | meta | state | decisions | index | changelog | context | research | design | plan | spec | testing
title: <short human title>
status: active | paused | complete | abandoned   # for meta/state; omit on leaves
updated: YYYY-MM-DD HH:MM:SS
relevance: [<tag>, <tag>]                          # keywords a crawler would match
---
```

Frontmatter is machine-validatable; the body is terse human/agent-readable prose.

## `manifest.md` (root, flat — top-tier locator)

```markdown
---
type: manifest
updated: YYYY-MM-DD HH:MM:SS
---

# Ledger Manifest

| Scope | Objective | Status | Sessions | Updated | Umbrella |
|---|---|---|---|---|---|
| `backend-service-migration` | Monolith → microservices | active | 2 | YYYY-MM-DD | — |
| `ui-react-migration` | AngularJS → React | active | 1 | YYYY-MM-DD | — |
```

One row per scope. This is the first thing a foreign agent reads after the README.

## `meta.md` (flat — stable identity)

```markdown
---
scope: <slug>
type: meta
status: active
updated: ...
relevance: [...]
---

# <Scope title> — meta

- **Objective:** one sentence — what this piece of work is.
- **Slug:** <slug>
- **Status:** active | paused | complete | abandoned
- **Sessions touched:** <count or short list>
- **Umbrella:** <parent initiative or —>
```

## `state.md` (flat — current snapshot, resumption)

Always reflects **now**. A resuming agent reads this one doc and knows where things
stand. Keep it current; do not let it become a history.

```markdown
---
scope: <slug>
type: state
status: active
updated: ...
relevance: [...]
---

# <Scope title> — state

## Done
- ...

## In progress
- ... (reference doc/leaf paths, not pasted content)

## Next
- ...

## Blockers / open questions
- ...

## Decisions currently in force
- <one-liners> → see `decisions.md`
```

## `decisions.md` (flat — ACTIVE only) + `archive/decisions.md` (SUPERSEDED)

`decisions.md` carries **only decisions in force**. The moment a decision is
superseded, the Archivist **moves it to `archive/decisions.md`** with date + rationale.
`decisions.md` never shows struck-through or rejected entries.

`decisions.md`:
```markdown
---
scope: <slug>
type: decisions
updated: ...
relevance: [...]
---

# <Scope title> — active decisions

## <Decision title>
- **Decision:** <what is in force>.
- **Date:** YYYY-MM-DD
- **Why:** <short rationale>.
- **Affects:** <docs / components>.
```

`archive/decisions.md`:
```markdown
---
scope: <slug>
type: decisions
updated: ...
---

# <Scope title> — superseded decisions

## <Decision title>  — superseded YYYY-MM-DD
- **Was:** <what we had decided>.
- **Superseded by:** <the active decision that replaced it>.
- **Why changed:** <rationale for the pivot>.
```

## `index.md` (flat — per-scope locator)

```markdown
---
scope: <slug>
type: index
updated: ...
---

# <Scope title> — index

| Doc | Path | Purpose | Relevance |
|---|---|---|---|
| Design overview | `design/overview.md` | service boundaries map | architecture |
| Data model | `design/data-model.md` | per-service schemas | data, schema |
| Plan | `plan/overview.md` | phased migration plan | rollout |
```

Lists every leaf in the scope, including nested ones. This is how a crawler finds the
single relevant doc without loading the tree.

## `changelog.md` (flat — per-scope, append-only)

Records **file changes**, not decisions (decisions live in `decisions.md`). Append; do
not rewrite history.

```markdown
---
scope: <slug>
type: changelog
updated: ...
---

# <Scope title> — changelog

## YYYY-MM-DD HH:MM:SS
- `design/overview.md`, `design/data-model.md` — added per-service schema section.
- `decisions.md` → `archive/decisions.md` — moved REST decision to archive (pivot to gRPC).
```

## Knowledge-group docs (`context/`, `design/`, `plan/`, … — folders)

`overview.md` for a single-concern group = the content. When grown, `overview.md`
becomes a map:

```markdown
---
scope: <slug>
type: design
title: ...
updated: ...
relevance: [...]
---

# <Scope title> — design overview

<For a grown group, a short orientation + links:>
- `data-model.md` — per-service schemas.
- `api-contracts.md` — gRPC service contracts.

<For a single-concern group, the full content goes here directly.>
```
