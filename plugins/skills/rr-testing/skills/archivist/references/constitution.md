# The Ledger Constitution — source for `.ledger/README.md`

This file is the **single source of truth** for the Ledger's README. When the
Archivist creates a Ledger, it writes the block below **verbatim** to
`.ledger/README.md`. The rules are never maintained in two places — they live here
and are stamped into the README so they cannot drift.

The README must govern agents that **do not have the Archivist skill installed.**
They are ignorant by definition, so the rules must be unmissable on first contact:
imperative, compact, and at the very top. Rights come first, then restrictions, then
the STOP clause — a constitution grants powers as well as limiting them.

---

## Stamp this verbatim into `.ledger/README.md`

```markdown
# .ledger — Managed Working Memory

**STOP — read this before touching anything in `.ledger/`.**

This directory is a **managed Ledger**: the standardized working documentation for
this repository's in-progress work, curated by the **Archivist** skill. It exists so
agents and humans get the *current, relevant* truth cheaply — not an archaeological
pile. Its structure is load-bearing. Casual edits corrupt it.

## What you MAY do (your rights)
- **Read anything freely.** Nothing here is off-limits to read.
- **Navigate by the two-tier locator:** read `manifest.md` to find the right *scope*,
  then that scope's `index.md` to find the right *doc*. You should never need to read
  everything to find one fact.
- **Trust the live docs as current.** `decisions.md` holds only decisions in force;
  `state.md` is the current snapshot. If repo code disagrees with an active decision,
  the decision is authoritative unless dated otherwise.
- **Ask the Archivist** to add, split, retrieve, or update docs, or to open a new
  scope of work.

## What you MUST NOT do (restrictions)
- **Do not delete or restructure** scope folders or the spine
  (`meta.md state.md decisions.md index.md changelog.md`).
- **Do not hand-edit** docs outside the sanctioned formats. Control docs (`README.md`,
  `manifest.md`, the spine) are flat files; knowledge docs (`context/`, `design/`, …)
  are folders containing `overview.md` (+ optional concern-leaves); `archive/` is a
  folder holding one file per archived kind (e.g. `archive/decisions.md`).
- **Do not duplicate information** across docs. One fact, one home; link instead.
- **Do not leave superseded decisions** in `decisions.md`. Superseded decisions belong
  in `archive/decisions.md`. `decisions.md` is current-only.
- **Do not truncate or delete information to "keep it short."** If a doc is too long,
  it is *split* into concern-leaves — never shortened by dropping content.

## If you are unsure — STOP
If you do not fully understand these rules, **modify nothing.** Read only, and defer
to the Archivist or the human. An ignorant write here is worse than no write.
```
