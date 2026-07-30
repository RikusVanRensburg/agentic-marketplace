---
name: build-with-tdd
description: Use when a GitHub issue or sub-issue needs implementing test-first, when a slice must be driven from red tests through independent QA to a merged issue, or when the user names one behavior to build with no tracker involved. Also invoked by rr-workshop:orchestration's DEV stage, once per sub-issue.
---

# Build with TDD

Tests verify behavior through **seams** — the public boundaries where you can observe what the system does without reaching inside. Code can change entirely; tests shouldn't. Each cycle is one **tracer bullet**: a single test you watch go **red**, then the minimal code that turns it **green**.

See [tests.md](tests.md) for what separates a good test from a bad one, and [mocking.md](mocking.md) for where mocking is legitimate.

## Modes

- **Standalone** — no issue. The user names the behavior to build, and you hand the result back to them.
- **Issue-driven, attended** — you are the main-thread agent working a tracked issue (the AFK loop), and you own the slice end to end.
- **Issue-driven, unattended** — you are the DEV sub-agent spawned by `rr-workshop:orchestration`. You are handed an issue number, a branch name, and a source branch, and you run in your own isolated worktree. Create that branch from the given source (`git checkout -b <branch> <source>`) inside your worktree, and do all git work there. Sub-agents are unavailable to you and there is no user to ask mid-run.
- **Issue-driven, shared worktree** — you are the slice sub-agent dispatched by `rr-workshop:relay-implement`. You are handed an issue number and a worktree that already sits on the run branch, with every earlier slice of this run already committed to it. Work where you stand: the branch exists, the worktree exists, and the engine verifies and closes the issue after you return. Sub-agents are unavailable to you and there is no user to ask mid-run.

| | Standalone | Issue-driven, attended | Issue-driven, unattended | Issue-driven, shared worktree |
| --- | --- | --- | --- | --- |
| [Full-Context Load](context-loading.md) | n/a — no issue | required before the first test | required before the first test | required before the first test |
| `state: in-progress` | n/a | set it (step 0) | set it (step 0), and report `inProgressSet` | set it (step 0), and report `inProgressSet` |
| Interface contract | ask the user, get approval | ask the user, get approval | the acceptance criteria + parent issue **are** the approved contract — derive and proceed | the acceptance criteria + parent issue **are** the approved contract — derive and proceed |
| Branch | current branch | `docs/agents/branches.md` convention | `git checkout -b <branch> <source>`, in your worktree | already checked out — the run branch in the engine's worktree |
| QA gate (step 4) | n/a — the user reviews | spawn an independent QA sub-agent | the orchestrator runs an independent QA stage after you return — finish green and return | one run-level review runs after every slice lands — finish green and return |
| Merge and close | n/a | you merge, then you close | the orchestrator's integrate stage merges and, on a verified merge, closes the issue | the engine verifies the suite on the run branch and closes the issue |

## Repo configuration

Optional — this skill works on a repo that has none of these. Check for each and use it if present:

- `docs/agents/testing.md` — this repo's test framework, mocking library, assertion style, and test file layout. Read it before the first test. Absent, follow [tests.md](tests.md) / [mocking.md](mocking.md) and match the conventions of the existing suite.
- `docs/agents/branches.md` — branch naming, for when you weren't handed a branch name.
- `<Product>/docs/agents/domain.md` — the glossary and ADR pointers, so test names and interface vocabulary match the project's domain language.

## 0. Claim the work (issue-driven modes)

If the repo defines a `state:` label taxonomy, mark the issue in progress:

```bash
gh issue edit <N> --add-label "state: in-progress" --remove-label "state: ready-for-agent"
```

Work with the taxonomy the repo already has — where those labels are absent, skip the edit and move on rather than creating them. Unattended runs report the outcome as `inProgressSet`.

Then satisfy the [Full-Context Load](context-loading.md) — the whole issue, its parent, the sibling sub-issues, every comment, all acceptance criteria — and check off its gate before writing any test.

## 1. Plan the seams

Name the seams under test, and the behaviors you will test at each. Respect the ADRs in the area you're touching and use the domain glossary so test names read in the project's own vocabulary.

Shape those seams so testing is natural:

- **Deep modules** — a small interface over substantial implementation. Ask what you can hide: fewer methods, simpler parameters, more complexity behind them.
- **Results over side effects** — `calculateDiscount(cart): Discount` is testable where `applyDiscount(cart): void` is not.
- **Injected dependencies** — a seam is real only when a second adapter can sit behind it (see [mocking.md](mocking.md)).

You can't test everything: agreeing the seams up front is how the effort lands on critical paths and complex logic.

**Done when** every acceptance criterion (standalone: every behavior the user named) is mapped to a named seam and at least one listed behavior to test, in priority order — and, in the attended modes, the user has approved that list. Ask: "What should the public interface look like, and which seams should we test?"

## 2. Red → green, one slice at a time

Work down the list, most central behavior first. Per behavior:

1. **RED** — write ONE test. **Run it and read the failure.** Confirm it fails *because the behavior is missing* — not from a typo, a bad import, a wrong path, or a fixture that never loaded. A test that passes on its first run is asserting something that already holds: rewrite it against the behavior you actually intend, or drop it.
2. **GREEN** — write the minimal code to pass that one test. **Run it and confirm it passes. Then run the rest of the suite and confirm nothing else broke.**

Work in **vertical slices**: one test → one implementation → repeat, each tracer bullet aimed by what the last cycle taught you. Tests written in bulk verify *imagined* behavior and freeze the test structure before the implementation has taught you anything.

Rules for every cycle:

- One test at a time, and only enough code to pass it. No speculative features for tests you haven't written.
- Test through the public interface, on observable behavior.
- Place the test file per the layout in `docs/agents/testing.md` if it exists, otherwise beside its nearest existing sibling tests.

**Done when** every acceptance criterion (standalone: every behavior from step 1) has at least one *passing* test that names it. Check them off one at a time against the list — the loop ends when no item is unchecked, not when the code looks finished.

## 3. Refactor

Refactor once the loop's list is exhausted and the suite is green — always on green, and never inside a red → green cycle. Run the tests after each refactor step. Look for:

- **Duplication** → extract a function or class
- **Long methods** → break into private helpers, with the tests staying on the public interface
- **Shallow modules** (large interface, thin implementation) → combine or deepen
- **Feature envy** → move the logic to where the data lives
- **Primitive obsession** → introduce value objects
- **Existing code** the new code has revealed as problematic

## 4. QA gate (issue-driven, attended)

With the loop green and the full suite passing, hand the work to an **independent QA sub-agent** for fresh-eyes verification rather than self-certifying.

- Spawn ONE sub-agent of type **`general-purpose`** — it must be able to run the build and tests, which a read-only analyzer agent cannot.
- Give it an **isolated, unbiased** prompt. A fresh sub-agent can't resolve this skill's relative paths, so **inline** the context mandate: tell it to read, fresh, the issue body + all comments + acceptance criteria, the parent issue + all comments, and the sibling sub-issues' acceptance criteria; pass the issue identifier, the parent reference, and a pointer to the branch/working tree. It must form its own picture from the source of truth — keep your own transcript, diff narration, and self-assessment out of that prompt.
- Its mandate: build from a clean state, run the suite, and check **each acceptance criterion** against the parent's intent. Return PASS, or a specific list of defects.
- **On defects:** fix them (a fresh red → green per defect) and re-run QA, bounded to **3 rounds**. If QA still fails after the third round, stop and escalate to the user with the three rounds of findings.

## 5. Close out

1. Re-run the full test suite — not just the new tests — and confirm it is green.
2. Commit to your branch with a conventional-commit message. Commit messages and issue comments carry your own words only: no `Co-Authored-By`, no Claude or Anthropic attribution.
3. **Log to the issue** (attended issue-driven runs — unattended runs report upward instead, and the integrate stage writes to the tracker) with `gh issue comment <N> --body "..."` when the implementation surfaced something the issue's author would want to know — not a play-by-play. Three triggers: a **non-trivial decision** the issue or PRD didn't direct; a **deviation** from the agent brief or acceptance criteria, and why; a **discovered follow-up** that is out of scope for this slice, so it can become its own issue.
4. Finish per your mode:
   - **Unattended** — return the branch name, `inProgressSet`, `committed`, a 1-3 sentence summary, any new files or APIs downstream issues will touch, and any out-of-scope TODOs. Leave the merge, the tracker comment, and the close to the integrate stage.
   - **Shared worktree** — commit to the run branch you are already on and return the same report as the unattended mode: `inProgressSet`, `committed`, a 1-3 sentence summary, any new files or APIs later slices will touch, and any out-of-scope TODOs. The engine verifies the suite and closes the issue.
   - **Attended, integrating directly** — an issue is done when its work is **merged**, not when QA goes green. Merge to the source branch, then close: `gh issue close <N> --reason completed --comment "<one-line summary>"` (`--reason` accepts only `completed` or `not planned`). Closing a sub-issue rolls up to the parent automatically, so the parent body needs no edit.
   - **Attended, leaving the work on a feature branch for review** — print `Closes #N` for each issue worked (aggregated if several) and let the merged PR close them. The developer pushes and opens the PR themselves (`gh pr create`); they decide the PR bundling.
   - **Standalone** — hand back what you built and the tests that cover it.
