# Engine pre-flight

This is the shared pre-flight both implementation engines read — `rr-workshop:orchestration` and
`rr-workshop:relay-implement`; each engine owns the stages beyond it, and its own consequences where
they differ.

## The standing rule on findings

`rr-workshop:defending-findings` applies to **pre-flight** — every edge and every branch decision is defended before the run starts. The stages that skip the defense return a plain verdict plus defects, and each engine names which those are: that cost belongs to the one-time graph decisions, not to a check that reruns per slice, per rung.

## Prerequisites

Each engine adds its own; these hold for both.

- **A breakdown EXISTS.** `gh api --paginate repos/{owner}/{repo}/issues/<PARENT>/sub_issues --jq '.[].number'` prints nothing ⇒ **stop** and point at `rr-workshop:to-issues`. An engine implements a tree; it creates no issues and edits no bodies, so a missing or wrong breakdown goes back there too.
- **Every slice still open carries `state: ready-for-agent` or `state: in-progress`.** First `gh label list --limit 200 --json name --jq '.[].name' | grep '^state:'` — empty output means the repo has no `state:` taxonomy, so nothing distinguishes a slice an agent may build from one reserved for a human: **stop** and get the user to confirm slice by slice. Otherwise read each slice's state alongside its labels (`gh issue view <n> --json state,labels --jq '[.state] + [.labels[].name]'`) and check the labels of the slices that read OPEN. Both engines read any CLOSED slice as landed — whether it merged, or was closed as not-planned or as a duplicate — and each drops it in Stage 2 on its own closed-slice reconcile before any slice is dispatched, so its labels decide nothing here. An open slice carrying neither passing label ⇒ **stop** and surface it.

  `state: in-progress` passes because it is the mark a prior dispatch left: `rr-workshop:build-with-tdd` swaps `ready-for-agent` for it when it claims a slice, and completion is recorded by the issue being CLOSED rather than by a label. So a relaunch reads `in-progress` on every open slice an earlier run already touched — including the blocked slice the relaunch exists to retry, which is what makes resume reachable at all.

  This check *is* the HITL filter, and it rests on the labels alone: `rr-workshop:to-issues` marks a slice needing a human `state: ready-for-human` and never `ready-for-agent`, so an untouched HITL slice carries neither passing label, fails this check, and never enters the graph pre-flight builds.

  Its one leak is a HITL slice a human legitimately started. A work-starter flips the slice's current `ready-*` value to `in-progress`, and `state:` holds exactly one value, so the `ready-for-human` mark is gone: the slice reads OPEN + `in-progress` and passes this check like any prior dispatch's. **The launch gate is where that is caught, not here** — each engine walks its whole order past the human there, so name every open `in-progress` slice as it goes by, as one an earlier dispatch is presumed to have touched. A slice the human claims as theirs comes out of the order.
- **GitHub tracker.** Pre-flight reads the tree and the run closes slices via `gh`: the "Sub-issues (parent/child tree)" and "Native blocking relationships" sections of [github-operations.md](github-operations.md).

## Reading the tree

The parent's body + **all** comments; enumerate every slice (`--paginate`) and read each body + **all** comments + acceptance criteria. Done when no slice remains unread.

## Promoting an edge

Read the **native** dependency relationship first — `gh api repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by --jq '.[].number'` — then cross-check it against the slice's `## Blocked by` prose, which carries the evidence that makes each edge real. Both channels agreeing is what promotes an edge into the graph. A disagreement between them, or a missing `## Blocked by` section, is a defect in the breakdown: resolve it with the user before the run starts. Edges come from these two channels only — never from the order slices are listed in, and never from issue numbers.

Each engine states what it does with the graph next, and what a wrong edge costs it there.

## Grilling to zero

Grill via `rr-workshop:grilling`: unclear acceptance criteria, conflicting requirements, doubtful edges, environment or credential needs — anything a dispatched agent would otherwise guess. Done when grilling reaches its own bound: its step-6 playback listed every branch by name with the answer it resolved to — a list, not a summary — and the user confirmed *that* list. An engine launches unattended, so no branch may still read open in that playback; a branch the user left open is a branch a dispatched agent would guess at.

## Red flags — STOP

- Implementing a slice in this session "because it's small" — the unit of work is a dispatch.
- An open slice entering the graph on neither `state: ready-for-agent` nor a prior dispatch's `state: in-progress` — a decision reserved for a human doesn't become agent work because you can guess the answer.

## Shared Done when

- [ ] Every slice's body, all its comments, and its acceptance criteria were read.
- [ ] Every open slice in the graph carries `state: ready-for-agent`, or `state: in-progress` from a prior dispatch; every `in-progress` one was named to the human at the launch gate, and none came back as theirs.
- [ ] Every edge is backed by both the native blocked-by relationship and its `## Blocked by` evidence, and every disagreement between the two was resolved with the user.
- [ ] The user confirmed grilling's step-6 playback, and no branch in it read open.
- [ ] The explicit launch-approval message exists and predates the first act of Stage 2.
