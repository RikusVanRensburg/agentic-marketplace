# Ledger structure — binding specification

This is the **canonical, binding** layout of the Ledger. The Archivist follows it
exactly. Deviation is a defect, not a judgement call.

## Location

- The Ledger lives at **`.ledger/` in the repository root** — always.
- The Archivist is **agnostic about git tracking.** It never reads, writes, or
  comments on `.gitignore`. Whether `.ledger/` is committed is the developer's call.
- The Archivist's evidence base is **the Ledger's own documents** — never git
  history or diffs. To learn what changed, read the docs, not the repo.

## Flat files vs. folders

There are two kinds of artifact, and the rule is simple:

- **Control artifacts are flat files.** The root `README.md` and `manifest.md`, and
  every scope's spine (`meta.md`, `state.md`, `decisions.md`, `index.md`,
  `changelog.md`) are single files. They are singular by nature and never split.
- **Knowledge documents are folders.** `context/`, `research/`, `design/`, `plan/`,
  `spec/`, `testing/`, and the per-scope `archive/` are folders. A knowledge folder
  contains an **`overview.md`** entry doc, plus optional **concern-leaves**
  (`data-model.md`, `api-contracts.md`, …) when it grows.

**Why the split:** foldering exists to support *split-don't-truncate* (below). Only
knowledge docs grow and split, so only they are folders. Control docs don't grow into
concern-leaves, so foldering them would be empty ceremony.

- For a single-concern knowledge group, `overview.md` *is* the content.
- For a grown group, `overview.md` is a short map that orients the reader and links to
  the concern-leaves.

## Top-level layout

```
.ledger/
  README.md            ← the Constitution (flat file)
  manifest.md          ← top-tier locator: every scope of work (flat file)
  <scope-slug>/        ← one folder per piece of work
    meta.md            ┐
    state.md           │  the SPINE — mandatory flat files in every scope
    decisions.md       │  (active decisions only)
    index.md           │  per-scope doc locator
    changelog.md       ┘  per-scope file-change history
    archive/           ← archived material (folder)
      decisions.md       superseded decisions + rationale
    context/           ┐
      overview.md      │  KNOWLEDGE GROUPS — folders, created on demand only,
    design/            │  never as empty placeholders. A group exists iff the
      overview.md      │  work has produced that content.
      data-model.md    │
    plan/              │
      overview.md      ┘
```

## The scope (piece of work)

- The organizing unit is the **piece of work** (logical scope), **not the session.**
  One piece of work may span many sessions; one session may touch several pieces of
  work. They are kept in separate scope folders regardless of when authored.
- **Slug:** kebab-case, derived from the work's objective
  (`backend-service-migration`). Archivist-assigned. Add a discriminator suffix only
  on a genuine collision.
- **Umbrella (deferred):** `meta.md` carries an optional `umbrella:` field for a parent
  initiative. The umbrella *layer* is not built in v1 — only the hook.

## The spine (mandatory per scope, flat files)

| File | Holds | Axis |
|---|---|---|
| `meta.md` | stable identity: objective, slug, status, sessions, `umbrella:` | identity (changes rarely) |
| `state.md` | current snapshot for resumption: done / in-progress / next / blockers / decisions in force | volatile (changes often) |
| `decisions.md` | **ACTIVE** decisions only | semantic decisions |
| `index.md` | locator for every doc in the scope: path · purpose · relevance | navigation |
| `changelog.md` | append-only, chronological record of *file changes* (what file changed, when, why) | file-change history |

`meta.md` and `state.md` are distinct on purpose: identity vs. live snapshot. Do not
merge.

## The archive (per scope, folder)

Superseded / retired material lives under `archive/`, one file per archived kind:

- `archive/decisions.md` — superseded decisions, each with date + supersession
  rationale. The moment a decision is superseded, the Archivist **moves it out of
  `decisions.md` into `archive/decisions.md`.** `decisions.md` stays current-only.

If a whole knowledge doc is later retired, it is moved under `archive/` too — `archive/`
is the single home for anything no longer in force.

## Knowledge groups (on demand, folders)

`context`, `research`, `design`, `plan`, `spec`, `testing`, and similar are created
**only when the work actually produces that content.** Never scaffold empty
placeholders — an empty doc is itself context pollution. `index.md` reflects only what
exists.

## Split, don't truncate

**Completeness always beats brevity. Information is never dropped to stay short.**

The goal is *small units of reading*, not *small bodies of knowledge*. Achieve it by
decomposition + indexed retrieval, never by deletion or summarization-away.

- A knowledge group that outgrows one readable concern keeps its `overview.md` as a map
  and gains **concern-leaves**, each single-concern, each listed in `index.md`.
- **Split trigger (concern-driven, not a line count):** split when (a) the doc covers
  more than one concern that can be read independently, or (b) a reader would routinely
  load far more than they need to answer a typical question. Ask: "would a reader want
  just one part of this?" If yes, split by part.
- A split only **reorganizes** information into addressable pieces. It removes nothing.

## Two-tier discovery

There is **no global doc index.** Discovery is strictly two tiers:

1. `manifest.md` → pick the right **scope**.
2. that scope's `index.md` → pick the right **doc** (leaf).

A consuming agent should never need to read everything to find one fact.

## Status vocabulary

Scope status, tracked in `manifest.md` and `meta.md`, is one of:
`active` · `paused` · `complete` · `abandoned`. Status changes must be
evidence-based (defending-findings), never assumed.
