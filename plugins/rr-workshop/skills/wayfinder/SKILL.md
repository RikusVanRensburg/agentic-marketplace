---
name: wayfinder
description: Fog between here and a nameable destination, on work too big for one agent session. Use when the user says "chart a map" or "work the map", references a wayfinder map issue, describes an idea whose destination is clear but whose way is not, or when rr-workshop:orchestrated-run needs its investigation stage.
---

A loose idea has arrived — too big for one agent session, and wrapped in **fog**: the way from here to the **destination** isn't visible yet. This skill charts that way as a **shared map** on GitHub Issues, then works its tickets one at a time until nothing is left to decide.

**Name the destination first.** It fixes the scope — every ticket, every patch of fog, every out-of-scope call is judged against it. It takes one of three shapes: a **spec** (handed to `rr-workshop:to-spec` when the way is clear), a **decision** to lock before planning starts, or a **change made in place** like a data-structure migration.

**Plan, don't do.** Each ticket resolves a decision, and the map is done when the way is clear — nothing left to decide before someone goes and does the thing. The pull to just do the work is the signal you've reached the edge of the map and it's time to hand off. An effort can override this in the map's **Notes**, carrying execution into the map itself; absent that, produce decisions, not deliverables.

**Standing rule:** every resolution, gist, and charting choice is a finding — `rr-workshop:defending-findings` applies throughout.

**Refer by name.** Maps and tickets are issues, so each has a name — its title. In everything the human reads, refer to it by that name with the link wrapped inside it: `[title](url)`.

## The map

One GitHub issue labelled `wayfinder:map` — the canonical artifact, and an **index, not a store**. It lists the decisions made and links the tickets holding their detail; each decision lives in exactly one place, its ticket, so the map gists and links rather than restates. Its body carries five sections — **Destination**, **Notes**, **Decisions so far**, **Not yet specified**, **Out of scope**. Loaded once per session, it is the whole effort at low resolution; open tickets aren't listed in it — they are open sub-issues, found by the frontier query.

Body templates and section rules: [references/charting.md](references/charting.md). All `gh` mechanics — sub-issue create → verify, label create-if-missing, claiming, native blocking relationships, the frontier query — live in [../../docs/github-operations.md](../../docs/github-operations.md).

### Tickets

Each ticket is a sub-issue of the map: one sharply-stated question sized to one agent session, carrying a `wayfinder:<type>` label — `research`, `prototype`, `grilling`, or `task` (see [Ticket types](#ticket-types)). The body stays the question; the answer arrives as a **resolution comment** when the ticket closes, and assets created along the way are linked from the issue.

A session **claims** a ticket by assigning it — `gh issue edit <n> --add-assignee @me` — before any work, so concurrent sessions skip it. That assignee *is* the claim: an open, unassigned ticket is unclaimed.

A ticket is **unblocked** when every ticket blocking it is closed. The **frontier** is the open, unblocked, unclaimed children of the map — the edge of the known, and the unit of parallelism: each frontier ticket can run in its own session.

## Ticket types

Every ticket is either **HITL** — human in the loop, worked *with* a human who speaks for themselves — or **AFK**, driven by the agent alone. A HITL ticket resolves only through that live exchange; the human's side of it is theirs to give (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): reading documentation, third-party APIs, code, or local resources like knowledge bases — directly or via `Explore` agents. Creates a markdown summary as a linked asset. Use when knowledge beyond the current conversation is required.
- **Prototype** (HITL): raise the fidelity of the discussion with a cheap, rough, concrete artifact to react to — an outline, a stub, or UI/logic code via `rr-workshop:prototype`. Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
- **Grilling** (HITL): conversation via `rr-workshop:grilling` and `rr-workshop:domain-modeling`, one question at a time. The default case.
- **Task** (HITL or AFK): manual work the discussion is blocked on — signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. The one type that *does* rather than decides, and it earns its place by unblocking a decision. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). The answer records what was done and any facts later tickets depend on.

## Fog of war

The map charts what is visible now. Beyond the live tickets lies the **fog of war** — decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. The map's **Not yet specified** section holds that dim view. Resolving a ticket clears the fog ahead of it, **graduating** whatever's now specifiable into fresh tickets — one ticket at a time, until the way to the destination is clear and no tickets remain.

**Fog or ticket?** The test is whether the question can be stated sharply now — *not* whether it can be answered now. Sharp question ⇒ ticket, even if it's blocked. Anything dimmer stays in Not yet specified, coarser than ticket-sized: one patch may graduate into several tickets, or none, once the frontier reaches it.

Fog gathers only *toward* the destination. Work beyond it is **out of scope** — scope, not sharpness, lands it there — recorded in the map's Out of scope section, where it never graduates: the frontier stops at the destination. It returns only if the destination is redrawn, and then as a fresh effort.

## Ground before asking

Before charting, and before resolving a grilling ticket, read the code the questions are about — directly, or by fanning breadth reads out to `Explore` agents, each carrying the preamble in [../defending-findings/DEFEND-PREAMBLE.md](../defending-findings/DEFEND-PREAMBLE.md) verbatim. Facts are looked up; only decisions are asked. Synthesis stays with you.

## Publishing tickets

Both modes create tickets this way. Command blocks: [../../docs/github-operations.md](../../docs/github-operations.md).

1. **Create → verify, one ticket fully before the next.** `gh issue create --parent <map_number> --type Task --label "wayfinder:<type>"`, body per [references/charting.md](references/charting.md), then verify the sub-issue link. Tickets are born **unclaimed**, so the frontier query can see them. Accumulate each new number in `CREATED`.
2. **Closing verification.** After the batch, run the `comm -23` set difference from github-operations.md's "Closing verification" — every number in `CREATED` against the map's actual sub-issue list. Require **empty output**, then report "N created, N verified as sub-issues of #<map>" and remove `CREATED`. Numbers printed mean those links are missing: name them and stop.
3. **Wire the edges — second pass.** Issues need numbers before they can reference each other, so edges land after creation. **Every edge gets both channels**: the `## Blocked by` section in the blocked ticket's body, which carries the evidence for the edge, and the native relationship, `gh issue edit <n> --add-blocked-by <blocker>`, which is the machine-checkable graph GitHub's UI and API render. A ticket born on the frontier carries `None — can start immediately` and no native edge.

## Chart the map

The user invokes with a loose idea; nothing exists yet.

1. **Name the destination.** Ground in the code, then run `rr-workshop:grilling` with `rr-workshop:domain-modeling` to pin down what this map is finding its way to — spec, decision, or change in place. Done when the destination and its shape are stated in one or two lines the user has agreed to.
2. **Survey the space.** Grill again, **breadth-first**: fan out across the whole space rather than deep on any one thread, biased toward architecture — boundaries, ownership, state, data flow, lifecycle, coupling, failure modes — until the open decisions and the first steps takeable now are on the table. **If the survey surfaces no fog** — the whole journey fits one session — no map is needed: stop and ask the user how they'd like to proceed. Pipeline-invoked by `rr-workshop:orchestrated-run`, that question is already answered — return without a map and its router advances to the spec stage.
3. **Ensure the five `wayfinder:*` labels exist**, created if missing (block in github-operations.md). If label creation is denied, degrade to a `[wayfinder]` title prefix plus a `Type:` line in each body.
4. **Create the map**: label `wayfinder:map`, `--assignee @me` (a singleton parent — see github-operations.md's "Assignee on creation"), body per [references/charting.md](references/charting.md) — Destination and Notes filled in, Decisions so far empty, the survey's fog sketched into Not yet specified.
5. **Publish the tickets you can specify now**, per [Publishing tickets](#publishing-tickets). Wiring sorts them into the frontier and the blocked; everything dimmer stays in the fog.
6. **Hand off.** Charting is one session's work: report the map by name, the count from the closing verification, and which tickets are on the frontier. Zero tickets resolved.

## Work the map

The user or the pipeline invokes with a map — URL or number. A ticket is **optional**: without one, you pick the next decision, not the user. **Exactly one ticket resolves per session**; the rest of the frontier belongs to parallel sessions, which are editing this same tracker while you work.

1. **Load the map** — the low-res view, not every ticket body.
2. **Choose and claim.** The ticket named, else the first frontier ticket (frontier query in github-operations.md). Claim it before any work.
3. **Resolve it**, zooming as needed: fetch the full body or resolution comment of related and closed tickets on demand; invoke the skills the map's Notes name; ground in the code before grilling. When in doubt, `rr-workshop:grilling` with `rr-workshop:domain-modeling`. Resolved means the ticket's Question has **one answer, stateable in a single line, and defensible** — a list of options with a lean is still an open ticket.
4. **Post the defended resolution.** Draft the answer as the ticket's resolution comment and take it through `rr-workshop:defending-findings` — the comment is a finding — then `gh issue comment <n>`. The ticket stays open.
5. **Advance the frontier.** Re-fetch the map body first, since parallel sessions edit it too. Then: append the answer's one-line gist to Decisions so far; graduate whatever fog the answer made specifiable into tickets, per [Publishing tickets](#publishing-tickets), deleting each graduated patch from Not yet specified; rule mis-scoped tickets out of scope; update or close the tickets this decision invalidated. Section rules in [references/charting.md](references/charting.md).
6. **Close the ticket** — `gh issue close <n> --reason completed`. This is the session's last act, so the map is already current for whoever arrives next. Report the handoff: the tickets now on the frontier.

## The way is clear

The way is clear when nothing remains to decide — no open tickets, and nothing in Not yet specified standing between here and the destination. Where the destination is a spec, hand off to `rr-workshop:to-spec`: it publishes the spec, links it as the map's sub-issue, and writes the destination-reached line into Decisions so far. The spec subtree carries the effort from there.

## Red flags — STOP

- An answer heading for a resolution comment as an assertion rather than a defended finding.
- A resolution that lists options with a lean instead of one stateable answer.
- A second ticket resolving this session — parallelism belongs to other sessions.
- Grilling about code you haven't read.
- A ticket created before the destination is named.
- `gh issue close` forming while the map still lacks the decision line or the graduated tickets.
- A `## Blocked by` reference with no matching native `--add-blocked-by` relationship.
- Non-empty `comm -23` output and a success report forming anyway.

## Done when

**Charting:**

- [ ] The destination is stated in the map body, and its shape — spec, decision, or change in place — is settled.
- [ ] The map issue exists, labelled `wayfinder:map`, carrying all five sections.
- [ ] Every ticket was individually created and verified as a sub-issue of the map, and the closing set difference printed nothing.
- [ ] Every `## Blocked by` reference is also wired as a native `--add-blocked-by` relationship.
- [ ] Zero tickets resolved.

**Working the map:**

- [ ] Exactly one ticket was claimed, and it is closed `--reason completed`.
- [ ] Its resolution comment is a defended finding, and it states one answer.
- [ ] The map's Decisions so far gained exactly one line.
- [ ] Every fog patch the answer made specifiable graduated into tickets — published, verified, edges wired on both channels — and each graduated patch is gone from Not yet specified.
- [ ] Tickets the decision invalidated are updated or closed; mis-scoped tickets are closed with a line in Out of scope.
- [ ] The map was current before the ticket closed.
