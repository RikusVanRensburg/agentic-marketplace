# Charting reference — map and ticket bodies

Templates and section rules for wayfinder's map issue and its tickets. Consulted when
creating the map, creating tickets, and whenever a resolution edits the map's sections
(graduating fog, ruling work out of scope).

## The map body

The whole map at low resolution, loaded once per session. Open tickets are **not** listed —
they are open sub-issues, found by query.

```markdown
## Destination

<what reaching the end of this map looks like — the spec, decision, or in-place change this
effort is finding its way to. One or two lines; every session orients to it before choosing
a ticket.>

## Notes

<domain; skills every session should consult; standing preferences for this effort — e.g. an
explicit override carrying execution into the map>

## Decisions so far

<!-- the index — one line per closed ticket: enough to judge relevance, then zoom the link
     for the detail the ticket holds -->

- [<closed ticket title>](<issue URL>) — <one-line gist of the answer>

## Not yet specified

<!-- in-scope fog you can't ticket yet; graduates as the frontier advances -->

## Out of scope

<!-- work ruled beyond the destination; closed, never graduates -->
```

## The ticket body

The body is the question, sized to one agent session. The answer is never written into the
body — it arrives as the resolution comment when the ticket closes; assets are linked from
the issue, not pasted in.

```markdown
## Question

<the decision or investigation this ticket resolves — stated sharply enough that another
session could claim it cold>

## Blocked by

- #<n> <blocking ticket title>
```

Or `None — can start immediately` under `## Blocked by` when the ticket is born on the
frontier. Blocking edges are wired in a **second pass** after creation, since issues need
numbers before they can reference each other.

## Decisions so far — entry rules

- One line per closed ticket, appended at resolution time, never batched.
- Refer by name: the ticket's title carries its link — `[title](url) — gist`.
- Gist only. The detail lives in the ticket's resolution comment; restating it here makes the
  map a store, and the two copies will diverge.
- This section records the route actually walked — scope boundaries (below) stay out of it.

## Not yet specified — section rules

- Everything here is **in scope** — the undiscovered frontier *toward* the destination — just
  not sharp enough to ticket. Apply the fog-or-ticket test from the skill: can the question be
  stated sharply now?
- Write each patch as loosely or as fully as the view allows; the section doubles as a
  signpost for collaborators reading where the effort is headed.
- Keep fog coarser than tickets: a patch may graduate into several tickets, or none, once the
  frontier reaches it. Pre-slicing fog into ticket-sized pieces fakes a precision you don't
  have.
- Excludes what's already decided (Decisions so far), what's already a live ticket, and
  what's out of scope.
- **Graduating a patch**: create the new ticket(s), wire their `## Blocked by` edges, then
  delete the patch from this section — it lives on only as its tickets.

## Out of scope — section rules

- Scope, not sharpness, lands work here: it sits beyond the destination, so it isn't fog and
  never graduates. It returns only if the destination is redrawn — and then as a fresh
  effort, not a resumption.
- Ruling something out is a scoping act, not a step on the route: one line — the gist plus
  why it's beyond the destination.
- **Retiring a mis-scoped ticket** (charted in error, or exposed by a resolution): **close
  it** — a closed ticket is unambiguously off the frontier — and leave one line here linking
  the closed ticket. It stays out of Decisions so far.
