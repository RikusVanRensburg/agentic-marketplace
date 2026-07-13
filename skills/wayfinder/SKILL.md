---
name: wayfinder
description: Wayfinding for work too big for one session — chart a shared map of investigation tickets on GitHub Issues, or resolve the next ticket on an existing map. Use when an idea arrives wrapped in fog — the destination is nameable but the way isn't visible — when the user says "chart a map" or "work the map", references a wayfinder map issue, or when rr-workshop:orchestrated-run needs its investigation stage.
---

A loose idea has arrived — too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** on GitHub Issues, then works its tickets one at a time until the route is clear.

**Naming the destination is the first act of charting**, because the destination fixes the scope — every ticket, every patch of fog, every out-of-scope call is judged against it. It takes one of three shapes: a **spec** (handed to `rr-workshop:to-spec` when the way is clear), a **decision** to lock before planning starts, or a **change made in place** like a data-structure migration. Settle which shape before anything else exists.

**Standing rule:** every resolution, gist, and charting choice is a finding — `rr-workshop:defending-findings` applies throughout.

## Plan, don't do

Wayfinder is **planning** by default: each ticket resolves a decision, and the map is done when the way is clear — nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes** — carrying execution into the map itself — but absent that, produce decisions, not deliverables.

## Refer by name

Every map and ticket is an issue, so it has a **name** — its title. In everything the human reads — narration, the map's Decisions-so-far — refer to it by that name, never by a bare number. A wall of `#42, #43, #44` is illegible; names read at a glance. The number and URL don't vanish — a name wraps its link — but they ride *inside* the name, never stand in for it.

## The map

The map is a single GitHub issue labelled `wayfinder:map` — the canonical artifact. Its tickets are native **sub-issues** of the map.

The map is an **index**, not a store. It lists the decisions made and points at the tickets that hold their detail; a decision lives in exactly one place — its ticket — so the map never restates it, only gists it and links. Its body carries four sections — **Destination**, **Notes**, **Decisions so far**, **Not yet specified** — plus **Out of scope** for work ruled beyond the destination. Loaded once per session, the body is the whole map at low resolution; open tickets are not listed in it — they are open sub-issues, found by query.

Body templates and section rules: [references/charting.md](references/charting.md). All `gh` mechanics — sub-issue attach/verify, label create-if-missing, the frontier query — live in [../../docs/github-operations.md](../../docs/github-operations.md).

### Tickets

Each ticket is a sub-issue of the map, its body one sharply-stated question sized to one agent session, carrying a `wayfinder:<type>` label — one of `research`, `prototype`, `grilling`, `task` (see [Ticket types](#ticket-types)).

A session **claims** a ticket by assigning it — `gh issue edit <n> --add-assignee @me` — **first**, before any work, so concurrent sessions skip it. That assignee *is* the claim: an open, unassigned ticket is unclaimed.

Blocking edges live in each ticket's `## Blocked by` body section. A ticket is **unblocked** when every ticket blocking it is closed; the **frontier** is the open, unblocked, unclaimed children of the map — the edge of the known.

The answer is not part of the body — it arrives as a resolution comment when the ticket closes. Assets created while resolving a ticket are linked from the issue, not pasted in.

## Ticket types

Every ticket is either **HITL** — human in the loop, worked *with* a human who speaks for themselves — or **AFK**, driven by the agent alone. A HITL ticket only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): reading documentation, third-party APIs, code, or local resources like knowledge bases — directly or via `Explore` agents. Creates a markdown summary as a linked asset. Use when knowledge beyond the current conversation is required.
- **Prototype** (HITL): raise the fidelity of the discussion with a cheap, rough, concrete artifact to react to — an outline, a stub, or UI/logic code via `rr-workshop:prototype`. Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
- **Grilling** (HITL): conversation via `rr-workshop:grilling` and `rr-workshop:domain-modeling`, one question at a time. The default case.
- **Task** (HITL or AFK): manual work that must happen before a *decision* can be made — nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one type that *does* rather than decides — and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). The answer records what was done and any resulting facts later tickets depend on.

## Fog of war

The map is *deliberately* incomplete: don't chart what you can't yet see. Beyond the live tickets lies the **fog of war** — the dim view of decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. Resolving a ticket clears the fog ahead of it, **graduating** whatever's now specifiable into fresh tickets — one at a time, until the way to the destination is clear and no tickets remain. The map's **Not yet specified** section holds that dim view.

**Fog or ticket?** The test is whether you can state the question sharply now — *not* whether you can answer it now. Sharp question ⇒ ticket, even if it's blocked. Anything dimmer stays in Not yet specified, coarser than ticket-sized: one patch of fog may graduate into several tickets, or none, once the frontier reaches it.

Fog only gathers *toward* the destination. Work beyond it is **out of scope** — scope, not sharpness, lands it there — recorded in the map's Out of scope section, and it never graduates: the frontier stops at the destination. Section rules, including how to retire a mis-scoped ticket, are in [references/charting.md](references/charting.md).

## Ground before asking

Before charting, and before resolving a grilling ticket, read the code the questions are about — directly, or via `Explore` agents each carrying the preamble in [../defending-findings/DEFEND-PREAMBLE.md](../defending-findings/DEFEND-PREAMBLE.md) verbatim. Facts are looked up; only decisions are asked. Breadth reads can run on sonnet/haiku; synthesis stays with you.

## Invocation

Two modes. Either way, **never resolve more than one ticket per session.**

### Chart the map

The user invokes with a loose idea.

1. **Name the destination.** Ground in the code, then run `rr-workshop:grilling` with `rr-workshop:domain-modeling` to pin down what this map is finding its way to — spec, decision, or change in place. The destination fixes the scope, so it is settled before anything else exists.
2. **Map the frontier.** Grill again, **breadth-first**: fan out across the whole space rather than deep on any one thread, biased toward architecture — boundaries, ownership, state, data flow, lifecycle, coupling, failure modes — surfacing the open decisions and the first steps takeable now. **If this surfaces no fog** — the whole journey fits one session — you don't need a map; stop and ask the user how they'd like to proceed.
3. **Ensure the labels exist**: the five `wayfinder:*` labels, created if missing (commands in [github-operations.md](../../docs/github-operations.md)). If label creation is denied, degrade to a `[wayfinder]` title prefix plus a `Type:` line in each body.
4. **Create the map** (label `wayfinder:map`), body per [references/charting.md](references/charting.md): Destination and Notes filled in, Decisions-so-far empty, the fog sketched into Not yet specified.
5. **Create the tickets you can specify now** as sub-issues of the map — create → link → verify per github-operations.md — then wire `## Blocked by` edges in a **second pass** (issues need numbers before they can reference each other). Wiring sorts them into the frontier and the blocked; everything dimmer stays in the fog.
6. Stop — charting is one session's work; zero tickets resolved.

### Work through the map

The user (or the pipeline) invokes with a map — URL or number. A ticket is **optional**: without one, you pick the next decision, not the user.

1. Load the **map** — the low-res view, not every ticket body.
2. Choose the ticket: the one named, else the first frontier ticket (query in github-operations.md). **Claim it**: `gh issue edit <n> --add-assignee @me` before any work.
3. Resolve it — **zoom as needed**: fetch the full body of related or closed tickets on demand; invoke the skills the map's Notes name; ground in the code before grilling. When in doubt, `rr-workshop:grilling` with `rr-workshop:domain-modeling`.
4. **Record the resolution**: draft the answer as a resolution comment and take it through `rr-workshop:defending-findings` — the comment is a finding — then post it, `gh issue close <n> --reason completed`, and append one line to the map's Decisions-so-far.
5. **Advance the frontier**: graduate any fog the answer has made specifiable into fresh tickets (create-then-wire), clearing each graduated patch from Not yet specified; rule mis-scoped tickets out of scope; update or close tickets the decision invalidated (section rules in charting.md).

The user may run unblocked tickets in parallel, so expect other sessions to be editing the tracker concurrently.

## The way is clear

When the destination is a spec, the way is clear when nothing remains to decide before `rr-workshop:to-spec` can synthesize — no open tickets, nothing left in Not yet specified. The map's final act is linking the published spec issue as its own sub-issue: the spec subtree carries the effort from there.

## Red flags — STOP

- About to close a ticket whose answer is asserted, not defended.
- About to resolve a second ticket this session.
- Grilling about code you haven't read.
- Creating tickets before the destination is named.
