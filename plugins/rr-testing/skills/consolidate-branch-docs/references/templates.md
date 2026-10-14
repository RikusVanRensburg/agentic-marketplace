# Artifact templates

Skeletons for the three artifact types. Match each project's existing style and tone — these templates are starting points, not rigid forms.

## Foundational architecture doc

Destination: `<Project>/docs/<TopicName>.md` (Pattern 2 hybrid) or `<Project>/docs/<Project>_<TopicName>.md` (Pattern 3 foundational-first).

```markdown
# <TopicName>

<One-paragraph description of what this subsystem is and what role it plays.>

## Architecture

<How it's structured. Component diagram in ASCII if useful. Key types and their responsibilities.>

## Key invariants

<Things that are true and must stay true. Each invariant gets a name, a statement, and a one-line *why*.>

- **<Invariant name>**. <Statement.> *Why*: <reason it can't be relaxed.>

## Design decisions

<Each decision: what was chosen, what was rejected, and *why* the rejected option doesn't fit. Decisions should outlive any single implementation.>

### <Decision name>

Chose **<option A>** over **<option B>**.

*Why*: <constraints / requirements that ruled out B. Be specific about what would have broken.>

## Operational notes

<Performance characteristics, concurrency model, failure modes worth knowing. Optional — include only when there's something non-obvious.>
```

## ADR (Architecture Decision Record)

Destination: `<Project>/docs/ADR/NNN-<short-slug>.md` where `NNN` is the next number after the highest existing ADR in the project (or `001` if none).

ADRs are for **sharp** decisions — a choice with clear alternatives, a clear winner, and consequences that affect downstream work. If it's softer than that, use the Design decisions section of a foundational doc instead.

```markdown
# ADR NNN: <Short decision title>

**Status**: Accepted
**Date**: <YYYY-MM-DD when the decision shipped>

## Context

<The forces in play that made this decision necessary. What problem are we solving? What constraints exist?>

## Decision

<The choice. One sentence. Then a paragraph elaborating.>

## Alternatives considered

### <Alternative A>

<What this alternative was. Why it was rejected — be specific about what would have broken or what cost it would have added.>

### <Alternative B>

<Same shape.>

## Consequences

**Positive**:
- <Concrete benefit.>

**Negative / accepted tradeoffs**:
- <Concrete cost or limitation we're choosing to live with.>

**Open questions** (optional):
- <Anything that still needs to be figured out.>
```

## Change-driven spec / plan

Destination: `<Project>/docs/feat|fix|refactor|chore/<topic-slug>/spec.md` (and optionally `plan.md` if implementation notes are extensive).

Use the change-type that matches the work:
- `feat/` — new functionality
- `fix/` — bug fix
- `refactor/` — restructuring with no behaviour change
- `chore/` — tooling / build / dependency work

```markdown
# <Topic Title>

**Shipped**: <YYYY-MM-DD>
**Commits**: <range or list, e.g. `abc1234..def5678` or `abc1234, def5678`>

## Problem

<What needed to change and why. Be specific about the user-facing or developer-facing pain.>

## Approach

<How it was done. Key decisions made during the work. Reference any foundational docs or ADRs that this work fed into or was driven by.>

## Issues hit + how rectified

<Concrete problems encountered during implementation and the specific fix. Highest-signal content of the document — future readers hitting similar problems benefit most from this.>

### <Issue name>

<What broke or surprised. What the fix was. Why the fix works.>

## Implementation notes

<Non-obvious invariants in the resulting code. "This looks weird because…" content. Anything a future maintainer might cleanup without realising it's load-bearing.>

## Out of scope

<Things explicitly not done in this unit of work, and where they were deferred to.>
```

## Style notes

- Match the existing project's tone. If the project's other docs use second-person ("you can…"), match it. If they're terse and technical, match that.
- Code references use `path/to/file.ext:line` format so they survive future restructuring less catastrophically than raw line links.
- For dates, use ISO `YYYY-MM-DD` unless the project's existing docs use a different format.
- Don't preserve the "Phase 1 / Phase 2 / …" structure from the source planning dir — the phased view is sequencing narrative (see [extraction.md](extraction.md)), not architectural content.
