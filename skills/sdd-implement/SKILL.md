---
name: sdd-implement
description: Implement an existing GitHub-issue breakdown as a relay of subagents in one shared worktree — serial slices, one review at the end, no Workflow tool. Use when the user wants a breakdown built without the Workflow research preview, when a prior relay's blockers are resolved and it should resume, or when rr-workshop:sdd-run reaches its implementation stage.
---

The **breakdown** exists; now drive **every** slice to committed-green on one **run branch** — the single branch every slice of this run commits to, and the branch the shared worktree sits on.

An interactive **pre-flight** in this session freezes the slice order, the run branch and the worktree path. The **relay** then passes the baton from one slice sub-agent to the next down that order until it is exhausted, and hands the integrated whole to one review and then to you.

**The standing rule on findings, the shared prerequisites, pre-flight's tree read, its edge rule, its
grilling step and the shared checklist are common to both engines.** Read
[../../docs/engine-preflight.md](../../docs/engine-preflight.md) before pre-flight begins —
it is the single source of truth for every requirement this skill does not state below.

Here the stages that skip the defense are the relay's **slice stages**.

## Prerequisites

Every prerequisite in [engine-preflight.md](../../docs/engine-preflight.md), plus:

- **`git worktree` works here.** `git rev-parse --is-inside-work-tree` and `git worktree list` both succeed. The relay's whole isolation is the one worktree it creates; if either command fails, **stop** and say which.
- **No `Workflow` tool needed.** The relay runs its loop from this session with plain `Agent` calls, so a reader arriving from `rr-workshop:orchestration` can drop that skill's research-preview prerequisite. That reach is this skill's reason to exist (ADR 0003), and its price is that the loop lives in your judgment rather than in a shipped script.

## Stage 1 — Pre-flight (interactive, in this session)

The relay asks you nothing once it starts; every ambiguity is resolved now.

1. **Read the whole tree** — [engine-preflight.md](../../docs/engine-preflight.md)'s "Reading the tree".
2. **Build the linear order.** Promote every edge by `engine-preflight.md`'s "Promoting an edge", then topologically sort the graph into a **total order**. One shared worktree admits exactly one writer, so each slice runs to completion before the next is dispatched — edges here fix the sequence, and there is no parallelism for them to unlock (ADR 0003). Done when every slice occupies exactly one position and every slice's blockers sit above it.
3. **Resolve the run branch and the worktree path.** The run branch follows the convention in `docs/agents/branches.md` when the repo has one, otherwise `sdd/<parent-slug>`; the worktree is a sibling of the repo root, `<repo-parent>/<repo-name>-sdd-<parent-slug>`. Also name the **base branch** the run branch forks from. The relay creates and names exactly one worktree, with `git worktree add` — leave the `Agent` tool's `isolation` unset so every slice lands in that one tree.

   Then enumerate the run's **disposable paths**: the gitignored directories a build regenerates from the tracked manifest — `node_modules`, `dist`, `target`, a build cache — which a failed attempt can leave stale. The list holds only what a build recreates; local configuration a slice reads — a gitignored `.env`, local settings, credentials — stays off it, because the relay restores nothing it deletes and no human is watching mid-run. An empty list is a valid answer. Done when the run branch, the base branch, the worktree path and the disposable-paths list are all written down.
4. **Settle the model for each slice.** The rungs are `haiku → sonnet → opus → fable`, cheapest to smartest. Per slice, take the first that exists: a model the human assigns to that slice here, then a run-wide default the human gives here, then the base rung `sonnet`. Model choice is discovered by climbing, not predicted: no selector agent runs and no `model:` label is written (ADR 0001). Done when every slice in the order carries a starting rung.
5. **Grill residual ambiguity to zero** — `engine-preflight.md`'s "Grilling to zero".
6. **Present the plan and get explicit launch approval.** Walk the total order slice by slice, with the run branch, the base branch, the worktree path, the disposable paths and each slice's starting rung. The user's approval message is the go/no-go for the relay.

## Stage 2 — Run the relay

1. **Create the worktree** on the run branch, forked from the base branch: `git worktree add -b <run-branch> <worktree-path> <base-branch>`. Resuming a run whose branch already exists, drop the `-b` and pass the run branch as the commit-ish. Done when `git -C <worktree-path> rev-parse --abbrev-ref HEAD` prints the run branch, and its HEAD — `git -C <worktree-path> rev-parse HEAD` — is written down as the run's first **green mark**.
2. **Reconcile against the tracker**, once: `gh api --paginate repos/{owner}/{repo}/issues/<PARENT>/sub_issues --jq '.[] | select(.state=="closed") | .number'`. Every slice it names is already landed — drop it from the order and spend no agent on it. This single read is what makes a relaunch idempotent.
3. **Pass the baton, one slice at a time.** For the next slice in the order, dispatch **one** `general-purpose` sub-agent on that slice's current rung, and inline into its prompt everything it needs, since it can resolve none of this skill's paths:
   - The instruction to invoke `rr-workshop:build-with-tdd` and work it in its **`Issue-driven, shared worktree`** mode — that mode owns the loop, the branch handling and the report shape.
   - The absolute worktree path, plus the instruction that **every** command it runs — git, build, test — runs inside that path. A dispatched agent starts in this session's working directory, so tell it to move to the worktree first and to keep every command there.
   - The slice's issue number, the parent issue's URL, and the run branch name.
4. **Verify, then close and re-mark.** In the worktree, build clean and run the **full** suite. Green ⇒ `gh issue close <n> --reason completed`, then move the **green mark** to what you just verified: `git -C <worktree-path> rev-parse HEAD`, written down in place of the previous mark. The baton passes to the next slice.
5. **On red, climb one rung.** Return the worktree to the green mark first, so the failed attempt leaves nothing behind:

   ```bash
   git -C <worktree-path> reset --hard <green-mark>   # rewinds every tracked file
   git -C <worktree-path> clean -fd                   # removes the untracked files the attempt created
   git -C <worktree-path> clean -fdx -- <disposable-paths>   # only when that list is non-empty
   ```

   The third command clears the ignored build state, so a rewound manifest and a stale dependency tree cannot disagree — scoped to the pre-flight list by pathspec, since an unscoped `-fdx` would take the run's local configuration with it and the next slice would have no environment to build in. Skip it when the list is empty, where an unscoped pathspec would sweep the whole tree. **What the reset restores:** every tracked file, plus the paths pre-flight declared disposable. **What survives it:** every other ignored path — which is where the local configuration lives, and where it stays.

   Re-dispatch the same slice on the next rung up, fed the failures from the round before. At the top rung, write a structured blocker to the slice's issue — the slice, the rungs tried, and what failed at each — then stop dispatching: no later slice starts, and the run goes to **Stage 3** on the slices that did land, carrying the blocker with it.

## Stage 3 — Review and disposition

**One review sub-agent, freshly isolated,** on `opus` — dispatched once the relay stops dispatching, whether it ran the order out or a blocker ended it early. This is the run's one findings-producing dispatch, and [../defending-findings/DEFEND-PREAMBLE.md](../defending-findings/DEFEND-PREAMBLE.md) names `review` among the stages that inject it, so its prompt opens with that file inlined **verbatim** — a fresh sub-agent cannot resolve these relative paths. Then tell it to form its own picture from the tracker: the parent's body + all comments, and the acceptance criteria of every slice that landed. Its mandate is the integrated whole — build from a clean state in the worktree on the run branch, run the full suite, and judge the landed work against the parent's intent, returning PASS or a specific list of defects. Name the slices that never landed as out of scope, so their absent functionality reads as scope rather than as a defect. Keep the relay's transcript and the per-slice reports out of that prompt, so the picture stays independent.

**Then the disposition is yours.** Relay the verdict and offer the choices: merge the run branch into the base branch, open a PR from it, remediate the findings, leave the worktree standing for later, or discard it. There is no automatic fix-and-regrade loop here — a `Workflow` runs one because no human is reachable inside it, and the relay has you right here (ADR 0003). The base branch changes only on your instruction; until then the relay's every commit sits on the run branch.

## Red flags — STOP

The two shared flags in [../../docs/engine-preflight.md](../../docs/engine-preflight.md), plus:

- Two slices in flight at once in the shared worktree. One writer at a time, always: concurrent sub-agents overwrite each other's working tree and the run's history stops being recoverable.
- Dispatching another slice after one exhausted its rungs. A top-rung failure ends the dispatch loop: the remaining order goes to the user intact, and Stage 3 reviews what landed.

## Done when

Every box in [../../docs/engine-preflight.md](../../docs/engine-preflight.md)'s shared checklist — where the graph is the order it sorts into, and Stage 2's first act is the `git worktree add` — plus:

- [ ] The order is total: every slice has exactly one position, and every slice's blockers sit above it.
- [ ] Exactly one worktree exists for this run, on the run branch, created by `git worktree add`.
- [ ] The closed-slice reconcile ran before the first dispatch.
- [ ] Every slice that landed was closed only after a clean build and a green full suite on the run branch.
- [ ] Every retry started from the green mark, with the disposable paths cleared and no other ignored path touched.
- [ ] Any slice that exhausted its rungs has a structured blocker on its issue, and no slice below it in the order was dispatched.
- [ ] The end-of-run review returned a verdict, and it was relayed.
- [ ] The disposition was the user's choice, and the base branch is unchanged unless they chose to change it.
