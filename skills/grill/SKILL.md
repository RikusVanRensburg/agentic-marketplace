---
name: grill
version: 1.0.2
description: Use when the user wants to stress-test a plan, design, or domain understanding by being interviewed relentlessly one question at a time, and wants the resolved terminology and architecture decisions captured as a self-contained topic folder. Triggers include "grill me", "grill me with docs", "/rr:grill", "this needs an ADR", "sharpen the language for X", "interrogate this design", "let's nail down the language for X".
---

## Core principle

A one-question-at-a-time domain interview producing a per-topic canon: `<project-root>/docs/grilled/<topic-slug>/` containing `CONTEXT.md` (glossary) and any ADRs the session yielded. Stack- and repo-agnostic.

## Hard rules

- **One question at a time, always with a recommended answer.** Wait for the user before continuing.
- **Read code before asking** when source can answer. Cite `file:line` when claims contradict code.
- **`CONTEXT.md` is glossary-only.** No rationale. One canonical term per concept; aliases in `_Avoid_`; 1–2-sentence definitions — what it IS, not what it does.
- **Update `CONTEXT.md` inline** the moment a term resolves. Never batch.
- **Sharpen fuzzy language.** Propose precise canonical terms; invent concrete scenarios to force boundary precision.
- **Offer ADRs sparingly** — only when all three hold: hard-to-reverse + non-obvious + real trade-off.
- **Pause for user approval on every ADR.** Draft inline; write only on approval.

## Output layout — locked

```
<project-root>/docs/grilled/<topic-slug>/
├── CONTEXT.md
└── adr/                    # created lazily, on first ADR write only
    └── NNNN-<kebab>.md
```

The script `<skill-base-dir>/scripts/init-grill.sh` walks up from CWD for project markers (bounded by git root, with fallback to it) and prints the topic-folder absolute path. Use `--dry-run` to preview the path without creating the folder. Use `--docs-root <dir>` to make `<dir>` the topic folder directly — bypassing project-root resolution and the `docs/grilled/<slug>` layout (used by `rr:workshop` to land grill output under `<scope>/.ledger/<slug>/grill/`).

## Session flow

1. **Topic + slug** — call `init-grill.sh --dry-run "<topic>"`, show the user the previewed path, confirm. Then call `init-grill.sh "<topic>"` without `--dry-run` to create the folder.
2. **Cross-topic scan** — read every existing `<project-root>/docs/grilled/*/CONTEXT.md` (except this topic's own). Build a `term → (other-topic, definition)` map.
3. **Interview** — apply hard rules; write resolved terms into `CONTEXT.md` immediately.
4. **Wrap** — print topic folder path, files touched, any `Flagged ambiguities` left open.

## Cross-topic conflict handling

When a conversation term matches the scan map:

- **Meanings match** — note it and reuse without re-defining.
- **Meanings differ** — halt. Show the existing definition verbatim and offer **Reuse** (adopt as-is), **Override-with-note** (define differently; `_Avoid_` points at the other topic), or **Rename** (pick a more precise term, e.g. `BillingCustomer` vs `OrderingCustomer`).

Resolution choices stick for the session.

## ADR flow

When the three-criteria gate is met: state the trade-off, draft the full template inline, **pause for approval**, then read `adr/` for the highest existing NNNN, increment, write `adr/NNNN-<slug>.md`. Numbering is per-topic-folder, four-digit zero-padded, from `0001`.

## Reference files

Read on demand.

| File | Read when |
|---|---|
| [references/CONTEXT-FORMAT.md](references/CONTEXT-FORMAT.md) | Writing or updating `CONTEXT.md`. |
| [references/ADR-FORMAT.md](references/ADR-FORMAT.md) | Considering or drafting an ADR. |
| [references/convention-detection.md](references/convention-detection.md) | Resolving project root, slug, or running the cross-topic scan. |
