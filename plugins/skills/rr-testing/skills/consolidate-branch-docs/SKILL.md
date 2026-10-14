---
name: consolidate-branch-docs
description: Wrap up a feature branch by consolidating its dated planning dirs (`docs/MMDDYYYY_topic/` with plan.md / phase-N-plan.md / research.md) into per-project living artifacts. Extracts design decisions + the *why*, issues hit + how rectified, and implementation notes worth keeping — discards phase-by-phase churn. Routes each artifact by what the work actually changed in code (library vs consumer app), not by the planning dir's name. Detects each project's docs convention (change-driven, hybrid, foundational-first) and matches it; defaults to hybrid for projects without one. Standards / ADRs / playbooks already at the right level stay put. Always pauses for explicit user confirmation before deleting source dirs. Use when user invokes `/rr:consolidate-branch-docs`, says "consolidate branch docs", "wrap up this branch's docs", "extract docs into project-level", "tidy planning dirs before merging", or just before merging a long-lived feature branch.
---

# Consolidate Branch Docs

Take a feature branch that accumulated dated planning dirs and turn them into per-project living documentation, then clean up the source dirs.

## Core principles

- **Extract signal, don't relocate**. Phase-by-phase planning narratives are churn once the work shipped. The signal is design decisions with the *why*, issues hit + how rectified, and non-obvious implementation notes. Relocating without extracting loses the asset.
- **Route by what the code shows, not by the planning dir's name**. A planning dir titled `starter-property-editor-mvp` may have shipped 90% of its code in a shared library — extracted artifacts belong with the library, not the Starter.
- **Match each project's existing convention, don't impose**. Read the project's existing `docs/` shape first. Only fall back to a default for projects without one.
- **Standards stay put**. Repo-level standards / ADRs / playbooks are already at the right level. Update content if branch work invalidated something, but do not relocate.
- **Cleanup requires explicit user confirm**. Always. Even after the skill's own verification passes.

## Workflow

### 1. Inventory branch-life docs

Run `scripts/inventory.sh` (see [scripts/inventory.sh](scripts/inventory.sh)) — auto-detects base branch and prints four lists: ADDED on branch, MODIFIED-touched-on-branch (pre-existed on base), DELETED-on-branch, and ADDED-on-base-since-branch-cut.

**Default**: `git log {base}..HEAD --diff-filter=A --name-only -- '*.md'` matches the natural "what did this branch add" model. **Fall back to diff-against-merge-base** (`git diff --diff-filter=A --name-only $(git merge-base {base} HEAD)..HEAD`) when the branch has been rebased or had base merged in — `git log` view can lie in those cases. The script runs both and surfaces mismatches.

Surface the inventory grouped by destination project before doing any extraction.

### 2. Classify each branch-life doc

Each doc falls into exactly one of:

| Class | Examples | Action |
|---|---|---|
| **Repo-level standard / ADR / playbook** | `docs/UI-STANDARD.md`, `docs/adr-*.md`, `docs/*-playbook.md` | Leave in place. Update content only if branch work invalidated something. |
| **Per-project README / CHANGELOG / library doc co-located with source** | `<project>/src/<lib>/README.md`, `<project>/src/<lib>/CHANGELOG.md` | Leave in place. Verify content reflects shipped state. |
| **Per-project planning dir** | `docs/MMDDYYYY_topic/{plan.md,phase-N-plan.md,research.md,...}`, `<project>/docs/MMDDYYYY_topic/...` | **Extract**. This is the bulk of the work. |

### 3. Route lib vs app correctly

For each planning dir, decide which project owns the resulting artifact(s) by reading what the work actually changed in code, **not** by the planning dir's name or location.

- Open the dir's `plan.md` / `research.md` and note file paths referenced.
- Cross-reference branch commits that mention the planning dir: `git log {base}..HEAD --grep "<planning-dir-name>"` and `git log {base}..HEAD --grep "<topic-slug>"`.
- Use the touched-file paths to classify: library code? consumer/app code? both?
- If both → split into two artifacts at the two destinations. Don't force one home.

### 4. Detect each project's docs convention

Before writing into a project, read its existing `docs/` to identify which pattern it follows. See [references/conventions.md](references/conventions.md) for the four recognized patterns, how to detect each, and which to choose as a default.

**Default for a project with no established convention**: Storage-style hybrid — foundational architecture at top-level in `docs/<TopicName>.md`, change-driven plans under `docs/feat|fix|refactor|chore/<topic>/`. Confirm the choice with the user before writing.

### 5. Decide artifact type per extracted content

Within a single planning dir, content can split across both types:

- **Foundational artifact** (long-lived, edited over years): system spec, API design, lifecycle/supervision model, schema/contract documents, architectural rationale. Destination = top-level `docs/<TopicName>.md` (per project convention) or `docs/ADR/NNN-<decision>.md` for a sharp architectural decision.
- **Change-driven artifact** (records one unit of work): one redesign, one bug fix, one refactor. Destination = `docs/feat|fix|refactor|chore/<topic>/spec.md` (or per project convention).

See [references/templates.md](references/templates.md) for the artifact skeletons.

### 6. Extract — capture signal, discard churn

For each planning dir, produce the artifact(s) chosen in step 5. See [references/extraction.md](references/extraction.md) for the signal-vs-churn heuristics with concrete examples.

Capture:
- Design decisions with the *why* — including alternatives considered and why they were rejected.
- Issues hit + how rectified — concrete problems and specific fixes. Highest-signal content.
- Implementation notes worth keeping — non-obvious invariants, "looks weird but is needed because" notes, performance/concurrency considerations.
- README / CHANGELOG updates where the work added or changed library/app surface.

Discard:
- Phase-by-phase blow-by-blow of how the work was sequenced.
- Decisions that were superseded later in the same branch.
- Transient TODOs / "next we'll do X" content where X already shipped.
- Restatement of things now obvious from the code.

### 7. Verification gate

Present a table to the user before any deletion:

| Source planning dir | Destination artifact(s) | Key extracted contents | Touched code paths |
|---|---|---|---|
| `docs/MMDDYYYY_foo/` | `<Project>/docs/Foo_Architecture.md`, `<Project>/docs/feat/foo-mvp/spec.md` | Decision: chose X over Y because Z. Issue: hit deadlock under W, fixed by V. | `<Project>/src/Foo/...` |

User reviews that every load-bearing piece from each source dir is reflected somewhere. If anything is missing, return to step 6 for that dir before proceeding.

Commit the consolidation. Use one commit covering all extracted artifacts so the consolidation step is a clean reviewable unit.

### 8. Cleanup — explicit confirm

After the consolidation commit lands and the verification table is acknowledged:

1. List the exact paths to delete (the source planning dirs, not standards or co-located READMEs).
2. **Wait for explicit user confirmation** ("yes proceed", "delete them", or similar). Do not auto-delete based on the skill's own verification — branch wrap-up is one of the highest-blast-radius moments in a project's life.
3. `git rm -r <paths>` and commit cleanup as a **separate commit** from the consolidation. Two commits keeps each step independently reviewable / revertable.

## What this skill does not do

- Cross-branch consolidation (operates on one branch at a time).
- Modifying anything already at the correct level/destination beyond targeted content updates.
- Forcing a docs convention onto projects that have one — only proposes a default for projects without.
- Touching code (operates on `.md` and adjacent doc files only).

## Resources

- [scripts/inventory.sh](scripts/inventory.sh) — branch-life doc inventory with log + diff cross-check
- [references/conventions.md](references/conventions.md) — the four docs convention patterns and detection
- [references/extraction.md](references/extraction.md) — signal-vs-churn extraction heuristics with examples
- [references/templates.md](references/templates.md) — skeletons for foundational doc, ADR, and change-driven spec/plan artifacts
