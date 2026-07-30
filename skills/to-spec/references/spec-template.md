# Spec template

The fixed shape of every spec `to-spec` drafts. Consulted at the drafting step; the body
between the `<spec-template>` markers is what gets rendered into the draft file and published
as the issue body.

Start the draft file with a thin metadata header so the publish step has the title and labels
to hand (an HTML comment — invisible in the rendered issue, harmless if published verbatim):

```markdown
<!-- spec-meta: title="<title>" type="<type>" scope="<scope>" -->
```

`type:` defaults to `feat`; offer to override (e.g. `refactor` for an architectural spec).
Include `scope:` only where the repo has a `scope:` label taxonomy.

## Ground rules

- Write modules, interfaces, and seams in the
  [architecture-language](architecture-language.md) vocabulary — the same terms the seam
  sketch used.
- **Name modules in prose** — file paths and code snippets go stale faster than the spec.
  **One exception — the prototype snippet:** if a prototype produced a snippet that encodes a
  decision more precisely than prose can (state machine, reducer, schema, type shape), inline
  it within the relevant decision and note briefly that it came from a prototype. Trim to the
  decision-rich parts — not a working demo, just the important bits.

<spec-template>

## Problem Statement

The problem the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list — extensive enough to cover every aspect of the feature. Format:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

## Implementation Decisions

The decisions made on the way here: modules built or modified and the seams they sit at,
interfaces changing, architectural decisions, schema changes, technical clarifications,
specific interactions.

Every entry is a **defended decision** (`rr-workshop:defending-findings`), carrying three
parts:

- **Decision** — one falsifiable claim.
- **Evidence, cited inline** — the closed ticket resolution, prototype verdict, grilling
  answer, or codebase fact that forces it.
- **Alternatives** — each named, with the attack that killed it.

<defended-decision-example>
3. **Escalation state lives in one `Ladder` module behind a two-method interface**
   (`advance`, `reset`). Evidence: the [state-model prototype](<ticket-url>) showed three
   call sites re-deriving rung state and diverging; deletion test — removing `Ladder`
   re-scatters that logic across all three callers. Alternatives: per-caller state (killed
   by the divergence the prototype demonstrated); a config-only table (killed: cannot express
   the resume rule resolved in [resume-semantics grilling](<ticket-url>)).
</defended-decision-example>

## Testing Decisions

- **Which modules will be tested** — exactly the modules the user named at the seam check,
  listed by name. This list is a hard input: it comes from the user, not from inference.
- **The seam each is tested at**, and why that seam.
- Prior art — similar tests in the codebase.

## Falsified Assertions

Statements already written elsewhere that this spec makes false — one per line, each naming the
file, what that statement currently claims, and what it has to say instead. These are edits the
implementation owes, so `rr-workshop:to-issues` turns them into slice work rather than leaving
them to be tripped over later. When the sweep came back empty, write `None found` and where you
searched: an empty section and an unsearched one read identically.

## Out of Scope

What is explicitly out of scope. When a wayfinder map exists, carry over its Out-of-scope
entries that bear on this spec.

## Further Notes

Any further notes about the feature.

</spec-template>
