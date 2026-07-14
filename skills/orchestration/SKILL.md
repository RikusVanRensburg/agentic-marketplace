---
name: orchestration
description: Implement an existing GitHub-issue breakdown unattended — ready-for-agent sub-issues with blocking edges driven to completion via the shipped workflow script. Use when a breakdown already exists and the user wants it implemented AFK ("run the breakdown", "implement the issues"), or when rr-workshop:orchestrated-run reaches its implementation stage.
---

The **breakdown** exists; now drive **every** slice to done, unattended, by launching the **dynamic workflow shipped with this skill** ([orchestration.js](orchestration.js)). Its machinery is what makes AFK-with-merge safe — each piece closes a gap that would otherwise rightly make an agent refuse to merge unattended:

- **Independent QA** per slice — a fresh agent forms its own picture from the issue tree and never sees the dev's report.
- **Verified merge** — integration builds and runs the full suite on SOURCE and resets on red; nothing closes for an unverified merge.
- **Dependency-ordered** — every task branch forks from SOURCE (never stacked on a sibling), and merges land on it serially in dependency order.
- **Escalation ladder + circuit breaker** — a QA rejection climbs the dev model one rung; a rejection at the top rung halts only that slice's dependency branch, with a structured **blocker**.
- **Resume** — a relaunch is idempotent: the script reconciles against the tracker before spending any agent.

It runs in **two stages**: an interactive **pre-flight** in this session, then a launched workflow that runs unattended.

**Standing rule:** `rr-workshop:defending-findings` applies to **pre-flight** — every edge and branch decision is defended before launch. The unattended QA and Final Review stages are deliberately cheaper: they return a plain pass/fail with a defect list, with no per-issue adversarial self-attack ritual — that cost belongs to the one-time graph decisions, not to a check that reruns per issue, per rung.

## Prerequisites

- **GitHub tracker.** Pre-flight reads the native sub-issue tree and the workflow comments/closes via `gh` — mechanics in [../../docs/github-operations.md](../../docs/github-operations.md).
- **A breakdown EXISTS.** This skill implements a tree; it does not create one. If the parent has zero sub-issues, **stop** and point at `rr-workshop:to-issues`.
- **Every slice is `state: ready-for-agent`** where the repo defines the `state:` taxonomy. Slices leave `rr-workshop:to-issues` ready, so a non-ready slice means the breakdown isn't finished — **stop** and surface it to the user. No taxonomy ⇒ skip this check.
- **Dynamic workflows are enabled** (a research-preview feature; enable via `/config`). If not, **stop and say so** — a serial in-session fallback forfeits the fan-out and the safety machinery above.

## Stage 1 — Pre-flight (interactive, in this session)

The workflow takes **no** human input once running; every ambiguity is resolved now.

1. **Read the whole tree.** The parent's body + **all** comments; enumerate every sub-issue (`--paginate`) and read each body + **all** comments + acceptance criteria.
2. **Build the dependency graph.** Edges, in priority order: (1) explicit `## Blocked by` references, (2) the order slices are listed in the parent body, (3) ascending issue number as tiebreaker. Detect cycles; resolve any with the user.
3. **Pre-resolve branches + source.** The workflow takes no mid-run input, so every branch decision must be made now. For each issue compute a deterministic branch name (using the pattern recorded in `docs/agents/branches.md` if it exists) and settle the single `SOURCE` branch DEV forks from and integration merges into. These travel as `args.graph[<n>].branch` and `args.source`; DEV agents take them as givens and never prompt.
4. **Grill residual ambiguity to zero** via `rr-workshop:grilling`: unclear acceptance criteria, conflicting requirements, doubtful edges, environment or credential needs — anything an unattended agent would otherwise guess.
5. **Present and get explicit launch approval (GATE 2).** The graph, the resolved branches/source, and the fan-out order. The approval message is the human's go/no-go.

## Stage 2 — Launch the shipped workflow

One call; the script's header comment is the args contract's single source of truth:

```
Workflow({
  scriptPath: '<this skill's base directory>/orchestration.js',
  args: {
    parent: '<parent issue URL>',
    source: '<SOURCE>',
    graph: { <issueNumber>: { deps: [<issue numbers>], title: '<title>', branch: '<pre-resolved branch>' }, ... },
    // optional: ladder, and the resume channel: integrated / answers / finalReviewDone
  },
})
```

**Never edit or re-author `orchestration.js` per run** — per-launch authoring lets the model vary the orchestration between runs, exactly the nondeterminism the workflow exists to eliminate (ADR 0002); per-run variation travels in `args`. The script validates the contract and fails fast on a malformed graph — cycles, duplicate branches, a branch equal to SOURCE — before spending a single agent.

Why the ladder and gates are shaped this way: dev is the output-heavy stage, so it runs the cheap rungs (default `sonnet → sonnet → opus`) and the cheapest-capable tier is *discovered* per slice — each QA rejection climbs one rung. The gates stay premium because verdicts are output-light: QA is `opus` at every rung, the serialized integrator is `opus`, and the final integrated review is `fable` in a pinned terse format.

## Post-run (back in this session)

Read the final report and relay it. Then:

- **Blockers.** For each structured blocker, grill the user via `rr-workshop:grilling`, then relaunch the same Workflow call with the resume channel: `integrated` (already-merged issue numbers), `answers` (issue number → clarification; the literal key `FINAL` carries final-review guidance), and `finalReviewDone: true` when a prior run already delivered the verdict.
- **Resume is same-session only.** A dead session cannot resume the workflow in place — but relaunching with the same args is idempotent: the script's live reconcile (a closed-issue check on the tracker) skips everything already landed.

## Boundaries

- Creates no issues and edits no issue bodies — a missing or wrong breakdown goes back to `rr-workshop:to-issues`.
- No Claude/Anthropic/Co-Authored-By attribution in any commit message or issue comment, anywhere in the run.

## Red flags — STOP

- About to edit `orchestration.js` for this run — per-run variation travels in `args`.
- The Workflow call forming before the explicit launch-approval message exists.
- A sub-issue whose body and comments were never read in pre-flight.
- Implementing a slice in this session "because it's small".

## Done when

- [ ] Pre-flight: every sub-issue read (body + all comments); graph acyclic and approved; every branch + source pre-resolved and unique; the explicit launch-approval message exists.
- [ ] Launch: exactly one Workflow call, and the script accepted the args.
- [ ] Post-run: the report relayed; every blocker grilled and relaunched, or explicitly handed to the user.
