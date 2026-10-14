# Charting reference — map and ticket bodies

Templates and section rules for wayfinder's map issue and its tickets. Consulted when creating
the map, when publishing tickets, and whenever a resolution edits the map's sections.

## The map body

```markdown
## Destination

<what reaching the end of this map looks like — the spec, decision, or in-place change this
effort is finding its way to. One or two lines; every session orients to it before choosing
a ticket.>

## Notes

<domain; skills every session should consult; standing preferences for this effort — e.g. an
explicit override carrying execution into the map>

## Decisions so far

<!-- one line per closed ticket: enough to judge relevance, then zoom the link for the
     detail the ticket holds -->

- [<closed ticket title>](<issue URL>) — <one-line gist of the answer>

## Not yet specified

<!-- in-scope fog you can't ticket yet; graduates as the frontier advances -->

## Out of scope

<!-- work ruled beyond the destination; closed, never graduates -->
```

## The ticket body

```markdown
## Question

<the decision or investigation this ticket resolves — stated sharply enough that another
session could claim it cold>

## Blocked by

- #<n> <blocking ticket title>
```

A ticket born on the frontier carries `None — can start immediately` under `## Blocked by`.

## Editing the map

### Decisions so far

- One line per closed ticket, appended at resolution time, never batched.
- Format: `[title](url) — gist`.
- Gist only. The detail lives in the ticket's resolution comment; a second copy here makes the
  map a store, and the two will diverge.
- This section records the route actually walked; scope boundaries stay out of it.

### Not yet specified

- Write each patch as loosely or as fully as the view allows; the section doubles as a signpost
  for collaborators reading where the effort is headed.
- Keep patches coarser than tickets. Pre-slicing fog into ticket-sized pieces fakes a precision
  you don't have.
- Holds in-scope fog only: what is decided sits in Decisions so far, what is sharp is already a
  ticket, and what is beyond the destination sits in Out of scope.
- **Graduating a patch**: publish the ticket(s) it became, then delete the patch — it lives on
  only as its tickets.

### Out of scope

- One line per entry: the gist, plus why it sits beyond the destination.
- **Retiring a mis-scoped ticket** (charted in error, or exposed by a resolution): close it — a
  closed ticket is unambiguously off the frontier — and leave one line here linking the closed
  ticket. It stays out of Decisions so far.
