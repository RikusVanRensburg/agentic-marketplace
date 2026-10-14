# Engine pre-flight

This is the shared pre-flight both implementation engines read — `rr-workshop:orchestration` and
`rr-workshop:relay-implement`; each engine owns the stages beyond it, and its own consequences where
they differ.

## The standing rule on findings

`rr-workshop:defending-findings` applies to **pre-flight** — every edge and every branch decision is defended before the run starts. The stages that skip the defense return a plain verdict plus defects, and each engine names which those are: that cost belongs to the one-time graph decisions, not to a check that reruns per slice, per rung.

## Prerequisites

Each engine adds its own; these hold for both.

- **A breakdown EXISTS.** `gh api --paginate repos/{owner}/{repo}/issues/<PARENT>/sub_issues --jq '.[].number'` prints nothing ⇒ **stop** and point at `rr-workshop:to-issues`. An engine implements a tree; it creates no issues and edits no bodies, so a missing or wrong breakdown goes back there too.
- **Every slice still open carries `state: ready-for-agent` or `state: in-progress`.** First `gh label list --limit 200 --json name --jq '.[].name' | grep '^state:'` — empty output means the repo has no `state:` taxonomy, so nothing distinguishes a slice an agent may build from one reserved for a human: **stop** and get the user to confirm slice by slice. Otherwise read each slice's state alongside its labels (`gh issue view <n> --json state,labels --jq '[.state] + [.labels[].name]'`) and check the labels of the slices that read OPEN. Both engines drop every CLOSED slice in Stage 2 on their own closed-slice reconcile, before any slice is dispatched — what that closure *means* is "What a CLOSED slice means" below — so a closed slice's labels decide nothing here. An open slice carrying neither passing label ⇒ **stop** and surface it.

  `state: in-progress` passes because it is the mark a prior dispatch left: `rr-workshop:build-with-tdd` swaps `ready-for-agent` for it when it claims a slice, and completion is recorded by the issue being closed `completed` rather than by a label. So a relaunch reads `in-progress` on every open slice an earlier run already touched — including the blocked slice the relaunch exists to retry, which is what makes resume reachable at all.

  This check *is* the HITL filter, and it rests on the labels alone: `rr-workshop:to-issues` marks a slice needing a human `state: ready-for-human` and never `ready-for-agent`, so an untouched HITL slice carries neither passing label, fails this check, and never enters the graph pre-flight builds.

  Its one leak is a HITL slice a human legitimately started. A work-starter flips the slice's current `ready-*` value to `in-progress`, and `state:` holds exactly one value, so the `ready-for-human` mark is gone: the slice reads OPEN + `in-progress` and passes this check like any prior dispatch's. **The launch gate is where that is caught, not here** — each engine walks its whole order past the human there, so name every open `in-progress` slice as it goes by, as one an earlier dispatch is presumed to have touched. A slice the human claims as theirs comes out of the order.
- **GitHub tracker.** Pre-flight reads the tree and the run closes slices via `gh`: the "Sub-issues (parent/child tree)" and "Native blocking relationships" sections of [github-operations.md](github-operations.md).

## Reading the tree

The parent's body + **all** comments; enumerate every slice (`--paginate`) and read each body + **all** comments + acceptance criteria. Done when no slice remains unread.

## What a CLOSED slice means

A closed slice carries a **close reason**, and the reason — not the closed state — is what says whether the work exists. Both engines read it the same way in their Stage 2 reconcile:

| Reason | The slice | The engine |
|---|---|---|
| `completed` | **landed** — built, verified, closed by this pipeline | Drop it from the work; spend no agent on it |
| anything else | **descoped** — it left the scope without being built | Drop it from the work too, and record it as descoped, never as landed |

Both engines close their own slices with `--reason completed`, so `completed` is the mark this pipeline writes and the reconcile reads back. **Test for `completed` positively**, rather than against the reasons that mean descoped: `not_planned` is also where a duplicate lands, a hand-closed issue can carry no reason at all, and GitHub is free to add reasons — an unrecognized one must read as descoped, never as done.

**A descoped slice with anything still-to-build depending on it stops the run.** Its dependents would build on functionality that does not exist, and whether they still stand depends on *why* it was descoped — which only the human who closed it knows. Each engine states its own stop mechanics; both stop before dispatching anything, and both name every descoped slice with its dependents so the human sees the whole mismatch at once.

**The two `gh` surfaces disagree on spelling.** REST (`gh api …/sub_issues`) returns `state` and `state_reason` lower-cased (`closed`, `completed`, `not_planned`); `gh issue view <n> --json state,stateReason` returns a camelCase field with upper-cased values (`CLOSED`, `COMPLETED`, `NOT_PLANNED`). A filter written for one surface matches nothing on the other and silently reports every slice as unlanded, so match the surface actually being called.

A reopened slice reads OPEN and carries no reason, so it needs no case of its own — it is simply work still to do.

## Promoting an edge

Read the **native** dependency relationship first — `gh api repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by --jq '.[].number'` — then cross-check it against the slice's `## Blocked by` prose, which carries the evidence that makes each edge real. Both channels agreeing is what promotes an edge into the graph. A disagreement between them, or a missing `## Blocked by` section, is a defect in the breakdown: resolve it with the user before the run starts. Edges come from these two channels only — never from the order slices are listed in, and never from issue numbers.

Each engine states what it does with the graph next, and what a wrong edge costs it there.

## Resuming a blocked slice

A slice that exhausted its rungs carries a **blocker comment on its own issue**. That comment is the run's only durable record of what the slice tried: a run report dies with its session, so a blocker kept only there is invisible to the next run and to the human. Both engines write one, and both read it back.

**Read the newest blocker comment on every open slice before settling that slice's rung**, because the resume starts *above* the rungs it records. Re-running a rung that already failed spends an agent to re-reach a known dead end, and across a full ladder that is every agent the slice was going to get — the second run dies exactly where the first did, having learned nothing. A slice whose whole ladder is spent has nothing left to climb, so it retries the **top rung once**: what changed since is the human's answer to the blocker, not the rungs.

Two slices legitimately start at the rung pre-flight assigns them: one with no blocker comment, and one whose blocker the human resolved by re-slicing the breakdown rather than answering the question — a re-sliced issue is new work, and its old rung history describes a slice that no longer exists.

## Grilling to zero

Grill via `rr-workshop:grilling`: unclear acceptance criteria, conflicting requirements, doubtful edges, environment or credential needs — anything a dispatched agent would otherwise guess. Done when grilling reaches its own bound: its step-6 playback listed every branch by name with the answer it resolved to — a list, not a summary — and the user confirmed *that* list. An engine launches unattended, so no branch may still read open in that playback; a branch the user left open is a branch a dispatched agent would guess at.

## Red flags — STOP

- Implementing a slice in this session "because it's small" — the unit of work is a dispatch.
- An open slice entering the graph on neither `state: ready-for-agent` nor a prior dispatch's `state: in-progress` — a decision reserved for a human doesn't become agent work because you can guess the answer.

## Shared Done when

- [ ] Every slice's body, all its comments, and its acceptance criteria were read.
- [ ] Every open slice in the graph carries `state: ready-for-agent`, or `state: in-progress` from a prior dispatch; every `in-progress` one was named to the human at the launch gate, and none came back as theirs.
- [ ] Every edge is backed by both the native blocked-by relationship and its `## Blocked by` evidence, and every disagreement between the two was resolved with the user.
- [ ] Every open slice's newest blocker comment was read, and every slice one names starts above the rungs it records — or at the top rung once, where it records a spent ladder.
- [ ] The user confirmed grilling's step-6 playback, and no branch in it read open.
- [ ] The explicit launch-approval message exists and predates the first act of Stage 2.
