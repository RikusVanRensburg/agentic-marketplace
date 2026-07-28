---
name: prototype
description: Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, explore what a UI should look like, or when rr-workshop:wayfinder works a prototype ticket.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Pick a branch

Identify which question is being answered — from the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). Build a tiny interactive terminal app that pushes the state machine through cases that are hard to reason about on paper.
- **"What should this look like?"** → [UI.md](UI.md). Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar.

The two branches produce very different artifacts — getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI) and state the assumption at the top of the prototype.

## Rules for both branches

- **Throwaway from day one, and clearly marked as such.** Locate the prototype code close to where it will actually be used — next to the module or page it is prototyping for — so context is obvious, and name it so a casual reader can see it is a prototype, not production.
- **Skip the polish.** The bar is *runnable*; everything past it — tests, error handling, abstractions — spends the time the prototype exists to save.

## Hand over, then capture

The **verdict** is the user's answer to the question, and it often arrives after this session ends. Handover and capture are two separate states, split on whether it has landed yet.

**Hand over.** Commit the prototype to a throwaway branch out of main and push it — the commit is never gated on the verdict. Then hand over. The handover is complete when it carries three things:

1. **How to reach it** — the run command (logic), or the URL and its `?variant=` keys (UI).
2. **The question**, quoted back verbatim from where step 1 wrote it down.
3. **The state of the verdict** — landed, or pending.

**Capture, once the verdict has landed.** Comment on the issue that drove the prototype (the wayfinder prototype ticket, or whatever issue prompted it) with `gh issue comment`, linking the pushed branch and stating the verdict and the question it settled — the prototype is a **primary source**. Then fold the validated decision into the real code: main keeps the decision, the branch keeps the prototype.

If the verdict is still pending, close the handover with the branch link and *capture pending on your verdict*, and capture in the session where the verdict arrives.
