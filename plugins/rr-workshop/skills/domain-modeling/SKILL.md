---
name: domain-modeling
description: Use when the ubiquitous language needs building or sharpening — a term to pin down, a fuzzy word to make precise, a CONTEXT.md or bounded-context glossary to write — when a decision should be recorded as an ADR, or when another skill (wayfinder, to-spec) needs the ubiquitous language maintained inline.
---

# Domain Modeling

The active discipline of moving the model: challenging terms, inventing edge-case scenarios, and writing the **ubiquitous language** and its decisions down the moment they crystallise. Fires when the model moves — a term coined, sharpened, or contested, or a decision worth recording. Each **bounded context** owns one ubiquitous language, held in its `CONTEXT.md`.

The moves below are a menu, not a sequence. Invoked on a single term (as `to-spec` does), run the moves that bear on that term; invoked for a whole session (as `wayfinder` does), keep them live throughout.

## Moves

### Challenge against the ubiquitous language

When the user uses a term in a way that conflicts with the bounded context's `CONTEXT.md`, call it out immediately. "Your CONTEXT.md defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When a term is vague or overloaded, propose a precise canonical one. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Stress-test with concrete scenarios

When domain relationships come up, invent specific scenarios that probe edge cases and force the user to be precise about where one concept ends and the next begins.

### Cross-reference with code

When the user states how something works, check whether the code agrees. Surface every contradiction: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

## Capture

### Write each term into CONTEXT.md as it resolves

The moment a term resolves, write it into the bounded context's `CONTEXT.md`, during the conversation rather than batched at the end.

`CONTEXT.md` carries vocabulary alone: the context's name, a sentence on why it exists, and the terms. Decisions belong in an ADR; behaviour belongs in the code.

Structure:

```md
# {Context Name}

{One or two sentences: what this bounded context covers and why it exists.}

## Ubiquitous Language

**Order**:
A customer's request for goods, accepted and tracked through to delivery.
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request
```

Rules:

- **Be opinionated.** When several words exist for one concept, pick the best and list the rest under `_Avoid_`.
- **Keep definitions tight.** One or two sentences, saying what the term IS.
- **Only terms this bounded context gives its own meaning.** General programming concepts — timeouts, error types, utility patterns — keep their ordinary meaning and stay out, however heavily the project uses them.
- **Group terms under subheadings** once natural clusters emerge.

### Offer ADRs sparingly

Offer an ADR only when all three hold:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

When a decision clears all three, read [ADR-FORMAT.md](./ADR-FORMAT.md) before drafting — it holds the kinds of decision that qualify and the template. Decisions short of the bar stay in the conversation.

## Where these files live

A single-context repo keeps `CONTEXT.md` at the root and ADRs in `docs/adr/`. A root `CONTEXT-MAP.md` — listing the contexts, where each lives, and how they relate — means the repo is multi-context: each context holds its own `CONTEXT.md` and its own `docs/adr/`, while root `docs/adr/` holds system-wide decisions. Infer which bounded context the current topic belongs to, and ask when that is unclear.

Create each file the moment you first have something to write into it.

**Done when:** every term this run coined or sharpened sits in the right `CONTEXT.md` with its `_Avoid_` list; every claim about how the domain works has been checked against the code; and every decision meeting all three ADR conditions has been offered as an ADR.
