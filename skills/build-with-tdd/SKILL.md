---
name: build-with-tdd
description: Test-driven development with the red-green-refactor loop. Use when the user wants to build features or fix bugs using TDD, mentions "red-green-refactor", wants integration tests, or asks for test-first development. Also invoked by rr-workshop:orchestration's DEV stage, once per sub-issue, in an already-prepared worktree.
---

# Test-Driven Development

## Philosophy

**Core principle**: Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style: they exercise real code paths through public APIs. They describe _what_ the system does, not _how_. They survive refactors.

**Bad tests** are coupled to implementation. They mock internal collaborators, test private methods, or verify through external means. Warning sign: your test breaks when you refactor, but behavior hasn't changed.

See [tests.md](tests.md) for principles and [mocking.md](mocking.md) for mocking guidelines.

## Configuration

None of the following are hard requirements — this skill works on a repo that has none of them. Check for each and use it if present:

- `docs/agents/testing.md` — if present, read it first for this repo's test framework, mocking library, assertion style, and file layout. If absent, follow the language-agnostic guidance in [tests.md](tests.md)/[mocking.md](mocking.md) and match the conventions of the existing suite.
- `docs/agents/branches.md` — if present **and** you weren't already handed a branch name, use its naming convention. When invoked from `rr-workshop:orchestration` the branch is always pre-resolved and passed to you — never invent one of your own.
- `<Product>/docs/agents/domain.md` — if present, read it for the glossary and ADR pointers so test names and interface vocabulary match the project's domain language.

**Issue-driven runs additionally require the [Full-Context Load](context-loading.md)** — read the whole issue + parent PRD + sibling sub-issues + all comments + acceptance criteria, and satisfy its checklist, before writing any test. (Standalone runs are exempt — there is no issue.)

## Invocation modes

- **Standalone** — `rr-workshop:build-with-tdd` with no arguments. The user provides the behavior to build; no issue tracker, no branch.
- **Issue-driven, unattended** — invoked with an issue number as a **DEV sub-agent spawned by `rr-workshop:orchestration`**. You are handed a branch name and are already inside a private worktree, checked out on that branch, forked from the correct base — all set up **before** you were invoked. Do NOT create a branch or worktree yourself, and never `cd` elsewhere. If the repo defines a `state:` label taxonomy, mark the issue in progress (`gh issue edit <N> --add-label "state: in-progress" --remove-label "state: ready-for-agent"`); if the labels don't exist, skip silently — never create labels.

> **Two execution contexts.** You may run as the **main-thread** agent (standalone), or as a **DEV sub-agent spawned by `rr-workshop:orchestration`** (orchestrated). A spawned sub-agent **cannot spawn further sub-agents and gets no mid-run user input.** Wherever a step below says "ask the user", "get approval", or "spawn a QA sub-agent", it applies to standalone runs only — the guarded notes call out what to do instead when orchestrated.

## Anti-Pattern: Horizontal Slices

**DO NOT write all tests first, then all implementation.** This is "horizontal slicing" — RED as "write all tests", GREEN as "write all code."

Produces **crap tests**:

- Tests in bulk test _imagined_ behavior, not _actual_
- You test the _shape_ of things, not user-facing behavior
- Tests become insensitive to real changes
- You outrun your headlights, committing to test structure before understanding implementation

**Correct**: Vertical slices via tracer bullets. One test → one implementation → repeat.

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  RED→GREEN: test1→impl1
  RED→GREEN: test2→impl2
  ...
```

## Workflow

### 1. Planning

Use the project's domain glossary (if `domain.md` exists) so test names and interface vocabulary match. Respect ADRs in the area you're touching.

> **Orchestrated runs (spawned by `rr-workshop:orchestration`):** you are unattended. The acceptance criteria + parent issue **are** the approved interface contract — derive the interface and proceed. The "Confirm with user", "Get user approval", and "Ask:" steps just below apply to **standalone** runs only.

Before writing any code:

- [ ] Confirm with user what interface changes are needed
- [ ] Confirm which behaviors to test (prioritize)
- [ ] Identify [deep modules](deep-modules.md) (small interface, deep implementation)
- [ ] Design interfaces for [testability](interface-design.md)
- [ ] List behaviors to test (not implementation steps)
- [ ] Get user approval

Ask: "What should the public interface look like? Which behaviors matter most?"

**You can't test everything.** Focus on critical paths and complex logic.

### 2. Tracer Bullet

Write ONE test that confirms ONE thing about the system:

```
RED:   Write test for first behavior → fails
GREEN: Write minimal code to pass → passes
```

Place the test file per the layout in `docs/agents/testing.md` if it exists, otherwise beside its nearest existing sibling tests.

### 3. Incremental Loop

For each remaining behavior:

```
RED:   Write next test → fails
GREEN: Minimal code to pass → passes
```

Rules:

- One test at a time
- Only enough code to pass the current test
- Don't anticipate future tests
- Keep tests focused on observable behavior

### 4. Refactor

After tests pass, look for [refactor candidates](refactoring.md):

- [ ] Extract duplication
- [ ] Deepen modules (move complexity behind simple interfaces)
- [ ] Apply SOLID where natural
- [ ] Consider what new code reveals about existing code
- [ ] Run tests after each refactor step

**Never refactor while RED.** Get to GREEN first.

## Checklist Per Cycle

```
[ ] Test describes behavior, not implementation
[ ] Test uses public interface only
[ ] Test would survive internal refactor
[ ] Code is minimal for this test
[ ] No speculative features
[ ] Test idioms match docs/agents/testing.md (if it exists)
```

## QA gate (issue-driven, standalone only)

> **Skip this entire gate when you were spawned by `rr-workshop:orchestration`.** A sub-agent cannot spawn sub-agents, and the orchestrator already runs an independent QA stage after you return. In that case: finish green, run the full suite, commit your branch with a no-attribution message, and return the branch name + a 1-3 sentence summary — do not spawn anything, do not merge, do not close the issue.

When you ARE the main-thread agent, after the loop is green and the full suite passes, do **not** self-certify. Hand the work to an **independent QA sub-agent** for fresh-eyes verification.

- Spawn ONE sub-agent of type **`general-purpose`** — it must be able to run the build and tests, which a read-only analyzer agent cannot.
- Give it an **isolated, unbiased** prompt. A fresh sub-agent can't resolve this skill's relative paths, so **inline** the context mandate (don't just link it): tell it to read, fresh, the issue body + all comments + acceptance criteria, the parent issue + all comments, and the sibling sub-issues' acceptance criteria; pass the issue identifier, the parent reference, and a pointer to the branch/working tree. Do **not** feed it your own transcript, diff narration, or self-assessment; it must form its own picture.
- Its mandate: build from a clean state, run the suite, and check **each acceptance criterion** against the parent's intent. Return PASS, or a specific list of defects.
- **On defects:** fix them (a fresh red→green per defect) and re-run QA. Bound this to **3 rounds**. If QA still fails after the third round, stop and escalate to the user with the three rounds of findings — do not keep grinding.

## End of session (issue-driven)

> **Orchestrated (spawned by `rr-workshop:orchestration`):** you are the DEV stage only. Commit your work to your assigned branch with a no-attribution message, then **return your branch + summary**. Do NOT merge, comment on, or close the issue — the orchestrator's integration stage owns the merge, the tracker comment, and (conditionally, per `closeOnIntegrate`) the close. The steps below are for standalone / AFK-loop runs.

1. Re-run the full test suite (not just new tests).
2. Confirm the QA gate above passed.
3. **Log to the issue** anything the issue's author would want to know (see below).
4. **Completion is integration, not QA-pass.** An issue is "done" when its work is committed **and merged** — not the moment QA goes green.
   - If you integrate directly (commit + merge to the source branch — e.g. the AFK loop), close the issue **after the merge**: `gh issue close <N> --reason completed --comment "<one-line summary>"` (`--reason` accepts only `completed` or `not planned`). Closing a sub-issue automatically updates the parent's roll-up — never edit the parent body to mark progress.
   - If you are leaving the work on a feature branch for review, do **not** close here. Print `Closes #N` for each issue worked (aggregate if multiple) and let the merged PR close it. The closed issue **keeps** its labels (including `state: in-progress`); they simply stop appearing in open-issue `state:` queries.
5. Remind the developer (review flow only): push and open the PR themselves (`gh pr create`); they decide PR bundling.

### Log to the issue

Post a comment (`gh issue comment <N> --body "..."`) when implementation surfaces something the author should see — not a play-by-play. Three triggers:

- A **non-trivial decision** you made that the issue or PRD didn't direct.
- A **deviation** from the agent brief or acceptance criteria (and why).
- A **discovered follow-up** that is out of scope for this slice (so it can become its own issue).

Never include Co-Authored-By or any Claude/Anthropic attribution in issue comments or commit messages.
