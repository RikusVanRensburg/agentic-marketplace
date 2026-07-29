---
name: sdd-implement
description: Implement an existing GitHub-issue breakdown as a relay of subagents in one shared worktree — serial slices, one review at the end, no Workflow tool. Use when the user wants a breakdown built without the Workflow research preview, when a prior relay's blockers are resolved and it should resume, or when rr-workshop:sdd-run reaches its implementation stage.
---

The **breakdown** exists; now drive **every** slice to committed-green on one **run branch** — the single branch every slice of this run commits to, and the branch the shared worktree sits on.

An interactive **pre-flight** in this session freezes the slice order, the run branch and the worktree path. The **relay** then passes the baton from one slice sub-agent to the next down that order until it is exhausted, and hands the integrated whole to one review and then to you.

**Standing rule:** `rr-workshop:defending-findings` applies to **pre-flight** — every edge and every branch decision is defended before the relay starts. Inside the relay the discipline travels by value: every prompt the relay dispatches opens with [../defending-findings/DEFEND-PREAMBLE.md](../defending-findings/DEFEND-PREAMBLE.md) inlined **verbatim**, because a fresh sub-agent cannot resolve these relative paths.

## Prerequisites

- **A breakdown EXISTS.** `gh api --paginate repos/{owner}/{repo}/issues/<PARENT>/sub_issues --jq '.[].number'` prints nothing ⇒ **stop** and point at `rr-workshop:to-issues`. This skill implements a tree; it creates no issues and edits no bodies, so a missing or wrong breakdown goes back there too.
- **Every slice carries `state: ready-for-agent`.** First `gh label list --limit 200 --json name --jq '.[].name' | grep '^state:'` — empty output means the repo has no `state:` taxonomy, so nothing distinguishes a slice an agent may build from one reserved for a human: **stop** and get the user to confirm slice by slice. Otherwise read each slice's labels (`gh issue view <n> --json labels --jq '.labels[].name'`); any slice missing `ready-for-agent` ⇒ **stop** and surface it.

  This check *is* the HITL filter. `rr-workshop:to-issues` labels a slice needing a human `state: ready-for-human`, never `ready-for-agent` — so a HITL slice fails this check and never enters the order pre-flight builds.
- **`git worktree` works here.** `git rev-parse --is-inside-work-tree` and `git worktree list` both succeed. The relay's whole isolation is the one worktree it creates; if either command fails, **stop** and say which.
- **GitHub tracker.** Pre-flight reads the tree and the relay closes slices via `gh`: the "Sub-issues (parent/child tree)" and "Native blocking relationships" sections of [../../docs/github-operations.md](../../docs/github-operations.md).
- **No `Workflow` tool needed.** The relay runs its loop from this session with plain `Agent` calls, so a reader arriving from `rr-workshop:orchestration` can drop that skill's research-preview prerequisite. That reach is this skill's reason to exist (ADR 0003), and its price is that the loop lives in your judgment rather than in a shipped script.

## Stage 1 — Pre-flight (interactive, in this session)

The relay asks you nothing once it starts; every ambiguity is resolved now.

1. **Read the whole tree.** The parent's body + **all** comments; enumerate every slice (`--paginate`) and read each body + **all** comments + acceptance criteria. Done when no slice remains unread.
2. **Build the linear order.** Read the **native** dependency relationship first — `gh api repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by --jq '.[].number'` — then cross-check it against the slice's `## Blocked by` prose, which carries the evidence that makes each edge real. Both channels agreeing is what promotes an edge into the graph. A disagreement between them, or a missing `## Blocked by` section, is a defect in the breakdown: resolve it with the user before starting. Edges come from these two channels only — never from the order slices are listed in, and never from issue numbers.

   Then topologically sort the graph into a **total order**. One shared worktree admits exactly one writer, so each slice runs to completion before the next is dispatched — edges here fix the sequence, and there is no parallelism for them to unlock (ADR 0003). Done when every slice occupies exactly one position and every slice's blockers sit above it.
3. **Resolve the run branch and the worktree path.** The run branch follows the convention in `docs/agents/branches.md` when the repo has one, otherwise `sdd/<parent-slug>`; the worktree is a sibling of the repo root, `<repo-parent>/<repo-name>-sdd-<parent-slug>`. Also name the **base branch** the run branch forks from. The relay creates and names exactly one worktree, with `git worktree add` — leave the `Agent` tool's `isolation` unset so every slice lands in that one tree. Done when the run branch, the base branch and the worktree path are all written down.
4. **Settle the model for each slice.** The rungs are `haiku → sonnet → opus → fable`, cheapest to smartest. Per slice, take the first that exists: a model the human assigns to that slice here, then a run-wide default the human gives here, then the base rung `sonnet`. Model choice is discovered by climbing, not predicted: no selector agent runs and no `model:` label is written (ADR 0001). Done when every slice in the order carries a starting rung.
5. **Grill residual ambiguity to zero** via `rr-workshop:grilling`: unclear acceptance criteria, conflicting requirements, doubtful edges, environment or credential needs — anything a dispatched agent would otherwise guess. Done when a full round surfaces no new question.
6. **Present the plan and get explicit launch approval.** Walk the total order slice by slice, with the run branch, the base branch, the worktree path and each slice's starting rung. The user's approval message is the go/no-go for the relay.

## Stage 2 — Run the relay

1. **Create the worktree** on the run branch, forked from the base branch: `git worktree add -b <run-branch> <worktree-path> <base-branch>`. Resuming a run whose branch already exists, drop the `-b` and pass the run branch as the commit-ish. Done when `git -C <worktree-path> rev-parse --abbrev-ref HEAD` prints the run branch.
2. **Reconcile against the tracker**, once: `gh api --paginate repos/{owner}/{repo}/issues/<PARENT>/sub_issues --jq '.[] | select(.state=="closed") | .number'`. Every slice it names is already landed — drop it from the order and spend no agent on it. This single read is what makes a relaunch idempotent.
3. **Pass the baton, one slice at a time.** For the next slice in the order, dispatch **one** `general-purpose` sub-agent on that slice's current rung, and inline into its prompt everything it needs, since it can resolve none of this skill's paths:
   - The contents of [../defending-findings/DEFEND-PREAMBLE.md](../defending-findings/DEFEND-PREAMBLE.md), verbatim.
   - The instruction to invoke `rr-workshop:build-with-tdd` and work it in its **`Issue-driven, shared worktree`** mode — that mode owns the loop, the branch handling and the report shape.
   - The slice's issue number, the parent issue's URL, the absolute worktree path, and the run branch name.
4. **Verify, then close.** In the worktree on the run branch, build clean and run the **full** suite. Green ⇒ `gh issue close <n> --reason completed`, and the baton passes to the next slice.
5. **On red, climb one rung.** Reset the worktree to the last commit the run branch was green at, then re-dispatch the same slice on the next rung up, fed the failures from the round before. At the top rung, write a structured blocker to the slice's issue — the slice, the rungs tried, and what failed at each — and end the relay there, handing the untouched remainder of the order back to the user.

## Stage 3 — Review and disposition

**One review sub-agent, freshly isolated,** on `opus`. Its prompt carries `DEFEND-PREAMBLE.md` verbatim and tells it to form its own picture from the tracker: the parent's body + all comments, and the acceptance criteria of every slice that landed. Its mandate is the integrated whole — build from a clean state in the worktree on the run branch, run the full suite, and judge the landed work against the parent's intent, returning PASS or a specific list of defects. Name the slices that never landed as out of scope, so their absent functionality reads as scope rather than as a defect. Keep the relay's transcript and the per-slice reports out of that prompt, so the picture stays independent.

**Then the disposition is yours.** Relay the verdict and offer the choices: merge the run branch into the base branch, open a PR from it, remediate the findings, leave the worktree standing for later, or discard it. There is no automatic fix-and-regrade loop here — a `Workflow` runs one because no human is reachable inside it, and the relay has you right here (ADR 0003). The base branch changes only on your instruction; until then the relay's every commit sits on the run branch.

## Red flags — STOP

- Implementing a slice in this session "because it's small" — the relay's unit of work is a dispatch.
- A slice entering the order without `state: ready-for-agent` — a decision reserved for a human doesn't become agent work because you can guess the answer.
- Two slices in flight at once in the shared worktree. One writer at a time, always: concurrent sub-agents overwrite each other's working tree and the run's history stops being recoverable.
- The relay continuing past a blocked slice. A top-rung failure ends the run; the remaining order goes to the user intact.

## Done when

- [ ] Every slice's body, all its comments, and its acceptance criteria were read.
- [ ] Every slice in the order carries `state: ready-for-agent`; no `ready-for-human` slice is in it.
- [ ] Every edge is backed by both the native blocked-by relationship and its `## Blocked by` evidence, and every disagreement between the two was resolved with the user.
- [ ] The order is total: every slice has exactly one position, and every slice's blockers sit above it.
- [ ] Grilling reached zero open questions.
- [ ] The explicit launch-approval message exists and predates the `git worktree add`.
- [ ] Exactly one worktree exists for this run, on the run branch, created by `git worktree add`.
- [ ] The closed-slice reconcile ran before the first dispatch.
- [ ] Every slice that landed was closed only after a clean build and a green full suite on the run branch.
- [ ] Any slice that exhausted its rungs has a structured blocker on its issue, and the relay stopped there.
- [ ] The end-of-run review returned a verdict, and it was relayed.
- [ ] The disposition was the user's choice, and the base branch is unchanged unless they chose to change it.
