# Slice template

The fixed body of every slice `to-issues` publishes. Consulted at the publish step; the body
between the `<slice-template>` markers is what goes into `gh issue create --body-file`.

## Ground rules

- **No `## Parent` section.** The parent relationship is structural — the sub-issue link set at
  the publish step — never textual. A "Parent:" line in the body is exactly the silent fallback
  the publish discipline forbids.
- **What to build describes end-to-end behaviour**, from the user's perspective — the
  narrow-but-complete path this tracer bullet cuts — never a layer-by-layer implementation
  list. A fresh agent picks the issue up cold; the body is its whole brief.
- **Acceptance criteria are checkable** by an agent reading only this issue — demoable
  behaviour, passing suite, observable state; not "code is clean".
- **No file paths or code snippets** — they go stale faster than the issue; name modules in the
  project's glossary vocabulary instead. **One exception — the prototype snippet:** if a
  prototype produced a snippet that encodes a decision more precisely than prose can (state
  machine, reducer, schema, type shape), inline it and note briefly that it came from a
  prototype. Trim to the decision-rich parts — not a working demo, just the important bits.
- **Blocked by references real issue numbers** — publishing in dependency order (blockers
  first) is what makes that possible — and each edge carries the one-line evidence that makes
  it real.
- **Wide-refactor slices (expand / migrate batch / contract) use the same body.** What to build
  names the batch's boundary (the package or directory being migrated) instead of a
  user-visible behaviour, and the acceptance criteria pin CI green with both forms coexisting.

<slice-template>

## What to build

The end-to-end behaviour this slice makes work, from the user's perspective — not
layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- #<number> <blocker title> — one line of evidence for the edge (one bullet per blocking slice)

Or "None — can start immediately".

</slice-template>
