# Ingestion contract — producing skills → the Archivist

**One writer.** The Archivist is the *sole* writer to `.ledger/`. Producing skills
(`rr:handover`, and any future doc-producing skill) **never
write to `.ledger/` directly** — that would re-implement the structure rules in every
skill and guarantee drift. Instead they **hand their output to the Archivist**, which
validates it (defending-findings), normalizes it into the sanctioned format, routes it
to the correct scope/group, and updates the control docs.

This is the single integration seam.

## The handoff

A producing skill emits **content + metadata**; the Archivist ingests:

```
content:   the document body the producing skill generated
metadata:
  source:    handover | <skill>
  scope:     <slug or "infer">     # "infer" → Archivist determines scope from evidence
  intent:    state | decision | context | design | plan | spec | testing | research
```

The Archivist then, per `structure.md` and `templates.md`:
1. Determines/confirms the scope (asks only if it genuinely cannot conclude).
2. Maps the content to the right target (table below).
3. Validates against the sanctioned format; reshapes as needed.
4. Writes, updates `index.md`, appends `changelog.md`, and archives any superseded
   decisions.
5. Returns a concise result (target paths + one-line summary).

## Source → target mapping

| Source | Typical content | Maps to |
|---|---|---|
| `rr:handover` | session state, decisions, dead-ends, next steps | `state.md` (+ decisions to `decisions.md`, dead-ends noted) |

## v1 boundary

- **v1 (this skill):** the ingestion entry point exists and works — the Archivist can
  ingest handed-off `content + metadata`.
- **Fast-follow (separate change):** modify `rr:handover` to route
  its output through the Archivist instead of writing its own files. That work
  touches that skill (and its tests/version) and is intentionally **out of scope
  for v1** to keep this change focused.
