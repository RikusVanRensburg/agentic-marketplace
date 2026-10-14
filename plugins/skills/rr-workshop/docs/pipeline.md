# Pipeline

This is the shared pipeline both routers read; each router owns its own row 5, row 6, and
disposition beyond it.

**The tree carries the state.** A run's only durable artifact is its GitHub issue tree: the map indexes the decisions, the spec issue is the spec, the slices are the plan, a slice closed `completed` is its work verified green on the run's branch while a slice closed on any other reason is work **descoped** without being built (each router's row 6 names the test its engine applies), and the final-review comment on the spec is the review trail. Nothing lands on disk — no ledger, no plan file, no review file — so any session, on any machine, re-derives where the run stands from the tree.

## The seed

The pipeline starts from a **seed** the user supplies: a symptom, a desired change, a "how does this work?" question — or a pointer at an existing tree (a map or spec issue). Until a seed exists, the only move is to ask for one.

## Rows 1–4

Rows are ordered so that **the first row that matches is the one to enter** — later rows presuppose earlier artifacts.

| # | Enter when | Stage |
|---|---|---|
| 1 | No map and no spec | `rr-workshop:wayfinder`, chart mode |
| 2 | Map open, with open non-spec tickets | `rr-workshop:wayfinder`, work mode — **one** ticket, per wayfinder's law |
| 3 | No open tickets, nothing in Not-yet-specified blocking the destination, and no spec yet | `rr-workshop:to-spec` |
| 4 | Spec exists, zero sub-issues | `rr-workshop:to-issues` |

**Small efforts skip the map.** Charting sometimes surfaces no fog — the whole journey fits in one session. Standalone, wayfinder stops there and asks the user how to proceed. Pipeline-invoked, this router *is* the answer to that question: advance to row 3 with the conversation as the input, and tell the user that is what happened. The spec becomes the tree's root, and later sessions resolve from it (rows 4–6).

## The gates

Three human approvals gate the pipeline. **Gates are asserted, not re-implemented** — each one lives inside its stage skill; the router's job is to confirm its evidence exists before the next stage runs.

| Gate | Lives in | Evidence the router asserts | Holds before |
|---|---|---|---|
| **Spec** | `to-spec` — `gh issue create` runs only after the approval message | the approval message; durably, the published spec issue itself, since to-spec publishes nothing unapproved | row 4 |
| **Breakdown** | `to-issues` — `gh issue create` runs only after the approval message | the approval message; durably, the published slices themselves | row 5 |
| **Launch** | each engine's pre-flight — `orchestration` and `relay-implement` both enter Stage 2 only after the launch approval | the launch-approval message, in the session that launched the engine | the engine's Stage 2 |

A spec or a breakdown that arrived by any other route has not passed its gate: get the user's explicit approval of it before advancing.

## Steps

Every invocation runs this loop.

1. **Resolve the tree.** The issue the user named; otherwise the open `wayfinder:map` issues (query mechanics in [github-operations.md](github-operations.md)) matched against the seed. The spec is the map's spec sub-issue — or the tree's root when the run skipped the map. More than one plausible tree: ask, never guess.
2. **State the resolution with its evidence** — which issues exist, which are open or closed, and which row they match. Nothing else happens before this.
3. **Assert the upstream gate.** Every gate the tree implies has been passed must have its evidence in hand before the stage that follows it runs.
4. **Enter the stage.** Invoke its skill and let it own the procedure through its own "Done when".
5. **Re-resolve** — back to step 1. One sitting carries a run from row 3 through its pipeline's launch gate, or resolves exactly one wayfinder ticket and then hands off.
6. **Hand off** when the session ends mid-pipeline: name the row the tree will match next, and where it runs — a successor session, or parallel sessions across the frontier.

## Standing discipline

- **defending-findings, everywhere.** This skill adds two duties: prepend the preamble in [../skills/defending-findings/DEFEND-PREAMBLE.md](../skills/defending-findings/DEFEND-PREAMBLE.md) **verbatim** into the prompt of any subagent dispatched directly from here (inline the text — subagents cannot resolve plugin paths), and refuse any stage output that asserts without defense — send it back through the defense before it enters the tree.

## Red flags — STOP

- A second wayfinder ticket resolving this session — resolve one, then hand the frontier to parallel sessions.
- A stage about to enter with its upstream gate's evidence unstated — state the evidence, then enter.

## Shared Done when

- [ ] Before any stage ran: the resolution was stated with its evidence — which issues exist, open or closed — and the row it matched.
- [ ] No stage ran without its upstream gate's evidence in hand.
- [ ] Every stage that ran met its own "Done when" before the pipeline advanced.
- [ ] A session ending mid-pipeline stated its handoff — the next row, and where it runs.
