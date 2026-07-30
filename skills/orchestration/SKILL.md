---
name: orchestration
description: Implement an existing GitHub-issue breakdown unattended — work the frontier of ready slices through to merged code. Use when the user wants an existing breakdown built AFK ("run the breakdown", "implement the issues"), when a prior run's blockers have been resolved and it should resume, or when rr-workshop:orchestrated-run reaches its implementation stage.
---

The **breakdown** exists; now drive **every** slice to merged, unattended.

Two stages. An interactive **pre-flight** in this session freezes the dependency graph — the **frontier** the run works, one wave of unblocked slices at a time. Then the launched workflow ([orchestration.js](orchestration.js)) carries that frontier to done with no human in the loop.

**Pre-flight is shared with the other engine.** Read
[../../docs/engine-preflight.md](../../docs/engine-preflight.md) before pre-flight begins —
it is the single source of truth for every requirement this skill does not state below.

Here the stages that skip the defense are the **unattended** ones, deliberately.

## Prerequisites

Every prerequisite in [engine-preflight.md](../../docs/engine-preflight.md), plus:

- **The `Workflow` tool is available.** Absent from your tool list ⇒ **stop and say so** (dynamic workflows are a research preview, enabled via `/config`). A serial in-session fallback forfeits the fan-out and every guarantee below.

## Stage 1 — Pre-flight (interactive, in this session)

The workflow takes **no** human input once running; every ambiguity is resolved now.

1. **Read the whole tree** — [engine-preflight.md](../../docs/engine-preflight.md)'s "Reading the tree".
2. **Build the frontier graph.** Promote every edge by `engine-preflight.md`'s "Promoting an edge". Get this right once: the script computes each wave's `ready()` in memory from exactly this graph and never re-reads dependency state from the tracker, so a wrong edge stays wrong for the whole run.
3. **Pre-resolve branches + source.** For each slice compute a deterministic **slice branch** — the convention in `docs/agents/branches.md` when the repo has one, otherwise the script's own shape, `orch/<parent-slug>-task-<issue>-<title-slug>` — and settle the single `SOURCE` branch every slice branch forks from and integration merges into. These travel as `args.graph[<n>].branch` and `args.source`; DEV agents take them as givens and never prompt.
4. **Grill residual ambiguity to zero** — `engine-preflight.md`'s "Grilling to zero".
5. **Present the frontier and get explicit launch approval (GATE 2).** Walk the graph wave by wave — which slices start immediately, what each later wave waits on — with the resolved slice branches and SOURCE. The user's approval message is the go/no-go.

## Stage 2 — Launch the shipped workflow

One call. The header comment of [orchestration.js](orchestration.js) is the args contract's single source of truth — read it for the optional args:

```
Workflow({
  scriptPath: '<this skill's base directory>/orchestration.js',
  args: {
    parent: '<parent issue URL>',
    source: '<SOURCE>',
    graph: { <issueNumber>: { deps: [<issue numbers>], title: '<title>', branch: '<pre-resolved slice branch>' }, ... },
  },
})
```

**Launch the script exactly as shipped**; every per-run difference travels in `args`. Per-launch authoring lets the model vary the orchestration between runs — precisely the nondeterminism this workflow exists to eliminate (ADR 0002).

The script validates the contract and fails fast — malformed graph, cycle, duplicate slice branch, a branch equal to SOURCE — before spending a single agent. Pre-flight's real job is the half the script **cannot** check: that every edge is real, every slice is AFK, and every acceptance criterion is unambiguous.

### What the launched workflow guarantees

Each piece closes a gap that would otherwise rightly make an agent refuse to merge unattended:

- **Independent QA** per slice — a fresh `opus` agent forms its own picture from the tree and never sees the dev's report.
- **Verified merge** — integration builds and runs the full suite on SOURCE and resets on red. Only a verified merge closes the slice, `gh issue close --reason completed`.
- **Dependency-ordered** — every slice branch forks from SOURCE (never stacked on a sibling), and merges land on SOURCE serially in dependency order.
- **Escalation ladder + circuit breaker** — dev is the output-heavy stage, so it starts on the cheap rungs, where each rung is a model paired with a reasoning effort and a climb can deepen effort before it changes model tier (the default lives in the script's `LADDER` const — one place, so changing it is one edit) and each QA rejection climbs one; a rejection at the top rung halts only that slice's branch of the graph, with a structured **blocker**. The gates stay premium because verdicts are output-light: QA, the serialized integrator, and the final integrated review all run `opus`.
- **Resume** — a relaunch is idempotent: the script's one live tracker read, a closed-issue reconcile, skips everything already landed before spending any agent.

## Post-run (back in this session)

Read the final report and relay it. Then:

- **Blockers.** Grill the user on each structured blocker via `rr-workshop:grilling`, then relaunch the same Workflow call with the **resume channel** filled in. Re-read the args contract in [orchestration.js](orchestration.js)'s header comment before composing it — the resume fields (already-merged slices, per-slice answers, final-review state) are defined there.
- **Resume is same-session only** for a live workflow: a dead session cannot resume it in place. Relaunching from a fresh session with the same args is the recovery — the reconcile makes it idempotent.

## Red flags — STOP

**Read the two shared flags in [../../docs/engine-preflight.md](../../docs/engine-preflight.md) and stop on either.** In this engine "the graph" is `args.graph`. This engine adds none.

## Done when

Every box in [../../docs/engine-preflight.md](../../docs/engine-preflight.md)'s shared checklist — where the graph is `args.graph` and Stage 2's first act is the Workflow call — plus:

- [ ] Exactly one Workflow call, on the shipped script, and it accepted the args.
- [ ] The final report was relayed, and every blocker was either grilled and relaunched or explicitly handed to the user.
