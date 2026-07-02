# ADR format

ADRs (Architecture Decision Records) capture the *why* behind a decision so a future reader can understand the trade-off without re-litigating it. In this skill, ADRs are scoped to the topic folder they live in.

## The three-criteria gate

Offer an ADR only when **all three** hold:

1. **Hard-to-reverse.** Undoing this decision later means migrations, breaking changes, or rewriting downstream code. If swapping the choice is a one-line change, it's not ADR-worthy.
2. **Non-obvious to a future reader.** Someone reading the code six months from now would ask "why did they do it *this* way?" — and the answer isn't visible in the code itself. Obvious choices (e.g. "we used the standard library JSON parser") don't need ADRs.
3. **Result of a real trade-off.** Genuine alternatives were considered and one was deliberately picked. If there was no real alternative — only one viable path — there's no trade-off to record.

If any of the three fails, don't offer an ADR. Note the decision in chat and move on. ADR sprawl is worse than missing ADRs; only the load-bearing decisions belong on disk.

## Approval flow

1. Skill announces the three-criteria gate is met and names the trade-off.
2. Skill drafts the **full template** (not the minimum) inline in chat.
3. User approves, edits, or skips.
4. On approval only: skill reads the topic's `adr/` folder, finds the highest existing NNNN, increments, and writes the file.
5. On edits: re-draft inline, re-pause for approval. Never write a partially-approved ADR.

The `adr/` folder is created lazily — on the first ADR write of the topic's lifetime, not up-front when the topic folder is initialized.

## Numbering

- Per-topic-folder. Each topic's ADRs are independent — topic A's `0001` and topic B's `0001` are unrelated.
- Start at `0001`. Four-digit zero-padded (`0001`, `0002`, … `0042`).
- Filename: `adr/NNNN-<kebab-slug>.md` where the slug is derived from the decision title (same slugify rules as the topic slug).

## Minimum acceptable content

```markdown
# ADR-NNNN: {Decision}

{One paragraph: what was decided and why.}
```

Use the minimum form only when the user explicitly requests the short version. Default is the full template.

## Full template

```markdown
# ADR-NNNN: {Decision}

## Status
Accepted | Proposed | Superseded by ADR-NNNN

## Context
{What forces are at play? What problem is being solved?}

## Decision
{The chosen option.}

## Considered Options
- **{Option A}** — {one-line trade-off}
- **{Option B}** — {one-line trade-off}

## Consequences
- **Positive:** {what this enables}
- **Negative:** {what this costs}
- **Neutral:** {follow-on choices forced}
```

## Worked example

```markdown
# ADR-0003: Use append-only audit log instead of mutable status field

## Status
Accepted

## Context
Each Order has a lifecycle (Placed → Paid → Fulfilled → Closed) with branches for Cancelled and Refunded. Customer support frequently asks "when did this Order move to state X and who did it?" The current mutable `status` column loses that history on every transition.

## Decision
Replace the mutable `status` column with an append-only `OrderEvent` table. Derive the current status from the latest event at read time. Cache the derived status on the Order row for query performance, but treat the events as the source of truth.

## Considered Options
- **Mutable status column with separate audit log table** — Two sources of truth; audit drift inevitable.
- **Append-only OrderEvent table, status derived** — One source of truth, slightly more complex reads.
- **Mutable status column with row-versioning at DB level** — Vendor-specific; ties us to the DB.

## Consequences
- **Positive:** Full lifecycle history; support questions answerable without forensic work.
- **Negative:** Reads must aggregate events or trust the cache; cache invalidation is a new failure mode.
- **Neutral:** Forces a follow-on decision on event retention and archival.
```
