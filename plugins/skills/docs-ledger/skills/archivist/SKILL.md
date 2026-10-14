---
name: archivist
version: 1.0.0
description: Use when documenting in-progress engineering work into the repository so future sessions and agents can pick it up — recording or updating context, decisions, design, plans, specs, test notes, or current state. Triggers include "archive this", "record this decision", "update the ledger", "what's the state of X", "log what we did", "set up docs for this work", "/docs-ledger:archivist", and starting or resuming a piece of work. Also use when docs are polluting agent context, when a plan changed and superseded decisions are confusing the picture, or when working docs are scattered and unstandardized.
argument-hint: "[what to record / retrieve, or the piece of work to resume]"
---

# The Archivist

Custodian of the repository's working memory. The Archivist curates a **Ledger** at
`.ledger/` — a tidy, standardized document set that gives agents and humans the
*current, relevant* truth cheaply, instead of an archaeological pile that floods
context with irrelevant and superseded information.

**Core principle:** documentation is valuable but dangerous to agents. The Archivist
keeps the value (durable, navigable working docs) and removes the danger (noise,
stale decisions, drift) by enforcing one binding structure and surfacing only what is
current and relevant.

## Not for

- In-session conversation compaction → `/compact`.
- Codebase `README.md` files → left as-is, in place. The Archivist never touches them.
- Promoting the Ledger into the codebase → out of scope (a future, separate skill).

## How it works — subagent-backed

The Archivist does its I/O in a **dispatched subagent** so the calling session's
context stays clean. You (the calling agent) do **not** read the whole Ledger or write
docs inline.

**To run it:** dispatch the `archivist` agent (Agent tool, `subagent_type: archivist`).
Its prompt MUST include:

- `LEDGER_REFS: <this skill's base directory>/references` — so the agent loads the
  binding rules (`structure.md`, `templates.md`, `constitution.md`,
  `ingestion-contract.md`). The base directory is shown to you when this skill loads.
- The **task**: what to record / update / retrieve / ingest, plus the content.

The agent returns a **concise** result (scope used, paths written/updated, decisions
archived, or the retrieved leaf + answer). Relay that — do not pull the docs into your
own context unless the user asked to see them.

## Lifecycle — when to dispatch

- **Start / resume** a piece of work → ask the Archivist for the scope's `state.md` so
  you pick up cleanly.
- **On a decision or change** ("record this", "we pivoted to X") → record it.
- **Checkpoint / end** → persist state, append changelog, archive superseded decisions.

It is invoked on request at these moments — and, where `.ledger/` exists, also
*ambiently* via plugin hooks (below).

## Ambient mode (plugin hooks)

The plugin ships hooks that make the Archivist ambient — but **only in repos that
have a `.ledger/`**. Creating the Ledger once opts the repo in; deleting it opts out.
Repos without a Ledger are never touched.

When `.ledger/` exists:
- **Session start** → a hook injects a directive to dispatch the archivist and load
  the active scope's `state.md` so you resume in context.
- **Doc written during work** → a `Write`/`Edit` hook detects a Ledger-worthy doc
  (a markdown file outside `.ledger/`, not a README) and, by default (**ambient**),
  queues it and flags it for routing at turn end.
- **Turn end** → if docs are queued, a `Stop` hook blocks once and directs you to
  dispatch the archivist to record them, then delete `.ledger/.pending`.

**Active mode** — when the user says to use the Archivist for the whole session
("use the archivist this session", "active archivist mode"), create the marker
`touch <repo>/.ledger/.session-active`. While it exists, **every** Ledger-worthy doc
write triggers an *immediate* archivist run instead of being queued. The marker is
cleared automatically at the next session start (it never leaks across sessions).

When a hook injects one of these directives, follow it: dispatch the `archivist`
agent as described above.

## Scope determination (defending-findings)

The Archivist decides the scope of work **autonomously from evidence** (the manifest +
recent scopes + what you report) and asks you only when it genuinely cannot conclude —
which should be rare. "Determine" means *conclude from evidence*, not guess: which
scope this is, and whether a session is straddling two pieces of work that must stay
in separate scope folders.

## The binding structure

The full, binding layout and the sanctioned doc formats live in
`references/structure.md` and `references/templates.md`. In brief: `.ledger/` at repo
root; control docs are flat files (root `README.md` + `manifest.md`; per-scope spine
= `meta.md state.md decisions.md index.md changelog.md`); knowledge docs are folders
with an `overview.md` (`context/`, `design/`, `archive/`, …), created on demand;
two-tier discovery (`manifest.md` → per-scope `index.md`); split docs, never truncate;
active decisions in `decisions.md`, superseded ones in `archive/decisions.md`. These
are rules, not suggestions — no exceptions unless absolutely required.

## Ingestion

Producing skills (any doc-producing skill) hand their output
to the Archivist rather than writing to `.ledger/` themselves — the Archivist is the
sole writer. See `references/ingestion-contract.md`.

## Common mistakes (the failures this skill prevents)

| Mistake | Correct behavior |
|---|---|
| Co-mingling two pieces of work in one doc set | Separate scope folders, even in one session |
| Leaving a superseded decision struck-through in the live doc | Move it to `archive/decisions.md`; `decisions.md` is current-only |
| Inventing a fresh ad-hoc structure each time | Follow the one binding layout exactly |
| Numbered doc names (`0001-…`) | No numbers; order lives in `index.md` |
| Dumping docs in `docs/` | The Ledger is `.ledger/` at repo root |
| Truncating/summarizing-away to "keep it short" | Split into concern-leaves; never drop info |
| Scaffolding empty placeholder docs | Create a knowledge group only when content exists |
| Reading the whole Ledger into the main session | Dispatch the subagent; relay its concise result |

## Red flags — STOP

- About to write to `.ledger/` from the main session instead of dispatching the agent.
- About to create a structure that differs from `structure.md`.
- About to keep a decision that changed alongside the new one "for context."
- About to shorten a doc by cutting content rather than splitting it.
- Treating two distinct objectives as one scope because they happened in one session.

## Quick reference

1. Recording/retrieving working docs? → dispatch the `archivist` agent.
2. Pass `LEDGER_REFS: <base>/references` + the task in the prompt.
3. The agent determines scope from evidence, follows the binding structure, keeps the
   spine current, archives superseded decisions, splits rather than truncates.
4. Relay the concise result; don't pull docs into your context.
