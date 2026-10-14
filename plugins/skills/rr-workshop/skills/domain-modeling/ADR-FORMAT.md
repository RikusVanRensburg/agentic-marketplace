# ADR Format

## What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between bounded contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target — the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; other contexts reference it by ID only." The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X." Anything a reasonable reader would assume the opposite of — recording it stops the next engineer from "fixing" something deliberate.
- **Constraints invisible in the code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is non-obvious.** If you considered GraphQL and picked REST for subtle reasons, record it — otherwise someone will suggest GraphQL again in six months.

## Template

One file per decision, named `0001-slug.md` — the next number after the highest already in `docs/adr/`.

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

A single paragraph is a complete ADR. The value is in recording *that* a decision was made and *why*.

## Optional sections

Add one only where it carries genuine value; most ADRs stay at the template.

- **Status** frontmatter (`proposed | accepted | deprecated | superseded by ADR-NNNN`) — useful when decisions are revisited
- **Considered Options** — when the rejected alternatives are worth remembering
- **Consequences** — when non-obvious downstream effects need calling out
