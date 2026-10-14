# Signal-vs-churn extraction heuristics

The planning dirs hold a mix of high-signal content (decisions, lessons, invariants) and low-signal scaffolding (phase sequencing, transient TODOs). The skill's job is to keep the first kind and discard the second.

## Four kinds of signal worth keeping

### 1. Design decisions with the *why*

A decision is high-signal when it tells a future reader **what was rejected and why**, not just what was picked. The rejection rationale is what survives later changes — the picked option might get swapped out, but the constraints that ruled out the alternatives usually persist.

**Keep**:
> Chose React Aria Components over Base UI because the date/time picker stack needed to be rebuilt and RAC ships native `Calendar` / `DateField` / `TimeField` / `DatePicker` primitives, while Base UI has none. The audit-handrolled-primitives plan had picked Base UI first because cross-modality state vocabulary was the dominant consideration; once date/time entered scope, that consideration was no longer dominant.

**Discard**:
> Chose React Aria Components for the migration.

### 2. Issues hit + how rectified

The highest-signal content in a branch's life. Concrete problem → concrete fix → context that makes the fix make sense. Future readers hitting the same shape of problem will save hours.

**Keep**:
> `Tabs.Tab` emits `data-active`, not `data-selected`. Every `data-[selected]:…` rule on the Tab silently never matched, so selected-text colour / count opacity / bottom border were no-ops for 7 commits. Fix: replaced with `data-[active]` and added a 3px positioned indicator span (inside the tab box, `bottom-0`) so the indicator survives the list's `overflow-y` clip. Lesson: verify primitive data-attr names from `node_modules` before writing selectors — wrong selectors compile cleanly.

**Discard**:
> Fixed a tab-indicator bug in Phase 5.

### 3. Non-obvious invariants and "this looks weird because…"

Anything a future maintainer might "clean up" without realizing it's load-bearing.

**Keep**:
> `ModalOverlay` is transparent `inset-0` and `Modal` uses `display: contents` — looks redundant but is required because the fixed-positioned `tb-drawer-shell` utility inside the modal handles its own layout. Removing the `display: contents` collapses the layout because RAC's `Modal` wraps children in a flex centering container by default.

**Discard**:
> The Modal uses display: contents (per the code).

### 4. README / CHANGELOG updates

If the branch added or changed library / app public surface, propagate to the right README/CHANGELOG. Don't write a separate consolidated doc for surface-level changes that belong in those files.

## Four kinds of churn to discard

### 1. Phase-by-phase sequencing narratives

> Phase 1 added the foundation. Phase 2 migrated the leaf primitives. Phase 3 migrated form primitives. Phase 4 migrated overlays. Phase 5 rebuilt date/time. Phase 6 dropped @base-ui.

This is how the work was *sequenced*, not what was *learned*. Once the work shipped, the sequencing is in `git log` if anyone needs it. Discard.

### 2. Superseded decisions

If the branch picked X, then later switched to Y, only the final decision and the *reason for the switch* are worth keeping. The interim "we picked X because…" should be summarized in the rejection rationale of the final decision, not preserved verbatim.

### 3. Transient TODOs / "next we'll…" content

Anything pointing forward to work that subsequently shipped, or to work that's no longer planned. If it's still pending, write a proper TODO; don't preserve the planning-dir version.

### 4. Restatement of code-obvious facts

> The `TimebaseSelect` component wraps RAC's `Select`, `Button`, `SelectValue`, `Popover`, `ListBox`, and `ListBoxItem`.

This is a `grep` away in the code itself. Don't restate it in docs unless there's a *why* attached.

## Concrete extraction walkthrough

**Source**: `docs/05132026_react-aria-components-migration/plan.md` plus six `phase-N-plan.md` files.

**Read everything in the source dir.** Note: total planning content is probably ~3000 lines across the seven files.

**Identify decisions** (look for "chose", "picked", "decided", "in favour of", "rejected", "instead of"):
- Library choice: RAC over Base UI (with the date/time picker driver — keep)
- API preservation: public Timebase wrapper APIs stay Timebase-flavoured at consumer boundaries (`value`/`onChange`/`invalid`/`disabled` not RAC's `selectedKey`/`onSelectionChange`/`isInvalid`/`isDisabled`) (keep — non-obvious invariant)
- Net bundle delta accepted (~+15-45 kB gz) (keep — captures the tradeoff)

**Identify issues** (look for "hit", "broke", "bug", "fix", "surprised", "didn't work", "compiled clean but"):
- `data-active` vs `data-selected` mismatch on `Tabs.Tab` (keep)
- `ModalOverlay` + `display: contents` requirement for fixed-positioned drawer shell (keep)
- `Pressable` wrapper needed for non-button menu triggers (keep)

**Identify invariants** (look for "preserve", "must not", "always", "never"):
- Public wrapper API preservation (already captured above)
- Each phase commits independently with Starter rendering / behaving identically before/after (keep — process invariant for future migrations)

**Discard**: the six `phase-N-plan.md` files entirely — they're sequencing narrative. The `plan.md` overview is also discardable once the decisions and issues above have been extracted.

**Output artifacts** (Pattern 2 hybrid; this is library work so destination is the React UI library's project):
1. **Foundational**: `<library-project>/docs/UI_Library_Primitives.md` — captures the public-API-preservation invariant, the data-attr verification lesson, the `display: contents` pattern for drawer shells. Edited over years as new primitives ship.
2. **ADR**: `<library-project>/docs/ADR/00X-base-ui-to-react-aria-components.md` — captures the library choice with the date/time-picker driver as the rejection rationale for Base UI. Sharp architectural decision; deserves its own ADR.
3. **Change-driven** (optional): `<library-project>/docs/refactor/base-ui-to-rac-migration/spec.md` — if the project's convention includes a `refactor/` tier, record the migration as one unit of work; otherwise skip and let commit history be the record.
