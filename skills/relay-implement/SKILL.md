---
name: relay-implement
description: Implement an existing GitHub-issue breakdown as a relay of sub-agents, unattended — serial slices in one shared worktree, the loop run from this session. Use when the user wants a breakdown relayed ("relay the breakdown", "relay these issues"), when a prior relay's blockers are resolved and it should resume, or when rr-workshop:relay-run reaches its implementation stage.
---

The **breakdown** exists; now drive the slice order to committed-green on one **run branch** — the single branch every slice of this run commits to, and the branch the shared worktree sits on. The run reaches as far down that order as the slices allow: to its end, or to the first slice that exhausts its rungs, where the dispatch loop stops and the slices below it stay undispatched for you.

An interactive **pre-flight** in this session freezes the slice order, the run branch and its base branch, the worktree path, the build and test commands, the disposable paths, and each slice's starting rung. The **relay** then passes the baton from one slice sub-agent to the next down that order, and hands what landed to one review and then to you.

**Pre-flight is shared with the other engine.** Read
[../../docs/engine-preflight.md](../../docs/engine-preflight.md) before pre-flight begins —
it is the single source of truth for every requirement this skill does not state below.

Here the stages that skip the defense are the relay's per-slice **dispatches**.

## Prerequisites

Every prerequisite in [engine-preflight.md](../../docs/engine-preflight.md), plus:

- **`git worktree` works here.** `git rev-parse --is-inside-work-tree` and `git worktree list` both succeed. The relay's whole isolation is the one worktree it creates; if either command fails, **stop** and say which.

## Stage 1 — Pre-flight (interactive, in this session)

Every ambiguity is resolved now.

1. **Read the whole tree** — [engine-preflight.md](../../docs/engine-preflight.md)'s "Reading the tree".
2. **Build the linear order.** Promote every edge by [engine-preflight.md](../../docs/engine-preflight.md)'s "Promoting an edge", then topologically sort the graph into a **total order**. One shared worktree admits exactly one writer, so each slice runs to completion before the next is dispatched — edges here fix the sequence, and there is no parallelism for them to unlock (ADR 0003). Done when every slice occupies exactly one position and every slice's blockers sit above it.
3. **Freeze the run's values — branches and worktree, build and test commands, ignore rules.** The run branch follows the convention in `docs/agents/branches.md` when the repo has one, otherwise `relay/<parent-slug>`; the worktree is a sibling of the repo root, `<repo-parent>/<repo-name>-relay-<parent-slug>`. Also name the **base branch** the run branch forks from. The relay creates and names exactly one worktree, with `git worktree add` — leave the `Agent` tool's `isolation` unset so every slice lands in that one tree.

   Then resolve the run's **build command** and **test command**, verbatim, from the repo's build manifest, its CI workflow or its contributing docs, and put both in front of the user with the rest of the frozen values. The test command runs the **full** suite; where no single command covers it, the frozen value is the ordered list of commands that together do. Stage 2's step 4 gates every close on these two commands, unattended, so a command still described rather than resolved is a command each slice improvises differently.

   Then partition every **ignore rule** in force. Enumerate them from every source — the repo's root and nested `.gitignore` files, `.git/info/exclude`, and the global excludes file (`git config --get core.excludesFile`) — and rule each one **disposable** or **kept**, with its reason. Disposable means a build regenerates it from the tracked manifest: `node_modules`, `dist`, `target`, a build cache. Kept means anything a build does not recreate — a gitignored `.env`, local settings, credentials — because the relay restores nothing it deletes. The run's **disposable paths** are the disposable side of that partition, and an empty disposable side is a valid answer; an unsurveyed one is not. Done when the run branch, the base branch, the worktree path, the build command and the test command are each written down, and every enumerated ignore rule sits on exactly one side of the partition with its reason.
4. **Settle the starting rung for each slice.** The rungs are `haiku → sonnet → opus → fable`, cheapest to smartest (ADR 0001). Per slice, take the first that exists: a model the human assigns to that slice here, then a run-wide default the human gives here, then the base rung `sonnet`.

   Then raise it past what a prior run already spent — [engine-preflight.md](../../docs/engine-preflight.md)'s "Resuming a blocked slice" governs: read the newest blocker comment on every open slice, and start the slice above the rungs that comment records, or at the top rung for one attempt where it records a spent ladder. Done when every slice in the order carries a starting rung, and every slice whose issue carries a blocker comment sits above the rungs that comment names.
5. **Grill residual ambiguity to zero** — [engine-preflight.md](../../docs/engine-preflight.md)'s "Grilling to zero".
6. **Present the plan and get explicit launch approval.** Walk the total order slice by slice, with the run branch, the base branch, the worktree path, the build command, the test command, the disposable paths and each slice's starting rung. The user's approval message is the go/no-go for the relay.

## Stage 2 — Run the relay

**Unattended from here.** The launch approval was the last moment a human was reachable, so every ambiguity the run surfaces is yours to settle: decide it on the frozen values, write the decision down for Stage 3, and where two moves differ take the reversible one.

### Once, before the first dispatch

1. **Create the worktree** on the run branch, forked from the base branch: `git worktree add -b <run-branch> <worktree-path> <base-branch>`. Resuming a run whose branch already exists, drop the `-b` and pass the run branch as the commit-ish. Done when `git -C <worktree-path> rev-parse --abbrev-ref HEAD` prints the run branch, and its HEAD — `git -C <worktree-path> rev-parse HEAD` — is written down as the run's first **green mark**.
2. **Reconcile against the tracker**, once, reading every closed slice's reason alongside its state — [engine-preflight.md](../../docs/engine-preflight.md)'s "What a CLOSED slice means" governs what each reason licenses, including the casing trap between the two `gh` surfaces:

   ```bash
   gh api --paginate repos/{owner}/{repo}/issues/<PARENT>/sub_issues \
     --jq '.[] | select(.state == "closed") | {number, reason: .state_reason}'
   ```

   Sort what it returns. A slice reading `completed` is **landed**: drop it from the order and spend no agent on it. A slice closed on any other reason is **descoped**: drop it from the order too, and write it down for Stage 3 among the slices that never landed.

   Then check the order once for the mismatch that stops the run: any slice still to be dispatched that names a descoped slice among its blockers. Found one ⇒ **stop**, and surface every descoped slice with the dependents that named it. Pre-flight's approval covered the tree as it stood; a slice descoped since then is a tree that changed underneath it, and only the human who descoped it knows whether its dependents still stand. Done when every closed slice sits on exactly one side of that sort, and no undispatched slice in the order names a descoped blocker.

### Per slice — steps 3–5, repeated until the order is exhausted or a slice exhausts its rungs

Each pass takes the next slice in the order and carries it through steps 3–5; closing that slice hands the baton to the one after it, and the next pass begins. The loop has exactly two exits, and both land on **Stage 3**: the order runs out, or a slice exhausts its rungs — and then no slice below it in the order is dispatched.

3. **Pass the baton.** For the next slice in the order, dispatch **one** `general-purpose` sub-agent on that slice's current rung, and inline into its prompt everything it needs, since it can resolve none of this skill's paths:
   - The instruction to invoke `rr-workshop:build-with-tdd` and work it in its **`Issue-driven, shared worktree`** mode — that mode owns the loop, the branch handling and the report shape.
   - The absolute worktree path, plus the instruction to move there first and run **every** command — git, build, test — inside it.
   - The slice's issue number, the parent issue's URL, and the run branch name.
   - The instruction to return, in that report, `committed` — and, when it is true, the SHA of the commit it left on the run branch.

   Done when that report is in hand carrying `committed: true` and a SHA, and `git -C <worktree-path> rev-parse HEAD` prints that same SHA and it is not the green mark. Anything else — `committed: false`, a report with no SHA, or a HEAD still sitting at the green mark — is a **red round** and goes to step 5, exactly as a red suite does; step 4 does not run on it.
4. **Verify, then close and re-mark.** In the worktree, run pre-flight's build command from a clean state, then pre-flight's test command. Both green ⇒ `gh issue close <n> --reason completed`, then move the **green mark** to what you just verified: `git -C <worktree-path> rev-parse HEAD`, written down in place of the previous mark.
5. **On red — a failing build, a failing suite, or a round that committed nothing — climb one rung.** Return the worktree to the green mark first, so the failed attempt leaves nothing behind:

   ```bash
   git -C <worktree-path> reset --hard <green-mark>   # rewinds every tracked file
   git -C <worktree-path> clean -fd                   # removes the untracked files the attempt created
   git -C <worktree-path> clean -fdx -- <disposable-paths>   # only when that list is non-empty
   ```

   The third command clears the ignored build state, so a rewound manifest and a stale dependency tree cannot disagree — scoped to the pre-flight list by pathspec, since an unscoped `-fdx` would take the run's local configuration with it and the next slice would have no environment to build in. Skip it when the list is empty, where an unscoped pathspec would sweep the whole tree.

   Re-dispatch the same slice on the next rung up, fed the failures from the round before. At the top rung, write a structured blocker to the slice's issue — the slice, the rungs tried, and what failed at each. Unattended, that blocker is the only way this run asks a question, so write it to read complete to someone who saw none of the rounds, then carry it into Stage 3: this is the loop's second exit.

   **Count the rungs tried from the slice's whole history, not this run's.** A slice that started above a prior run's rungs spent those too, and a blocker reporting only this run's rounds would let the next pre-flight restart lower than this one did — each resume undoing the last one's climb. So name the rungs this run tried, the rungs it started above, and the total.

## Stage 3 — Review and disposition

**One review sub-agent, freshly isolated,** on `opus` — dispatched once Stage 2's loop exits. This is the run's one findings-producing dispatch. A fresh sub-agent resolves none of the paths below, so each of these three is **inlined** into its prompt:

- **The defense preamble, first and verbatim.** [../defending-findings/DEFEND-PREAMBLE.md](../defending-findings/DEFEND-PREAMBLE.md) names this review among the stages that inject it, so the prompt opens with that file.
- **The shared judgment mandate, at its integrated-whole scope** — [../../docs/independent-judgment.md](../../docs/independent-judgment.md). It is the single source of truth for what the review reads fresh from the tracker, what never reaches it, the verdict shape, and the slices that never landed being named as out of scope.
- **This run's frozen values**, which the shared mandate leaves to each engine: the absolute worktree path and the run branch as the one place its checks run, and pre-flight's build command and test command as the checks themselves.

Done when a verdict is in hand, and the prompt that produced it carried all three items above and neither the relay's transcript nor a per-slice report.

**Then the disposition is yours.** Relay the verdict and offer the choices: merge the run branch into the base branch, open a PR from it, remediate the findings — a fresh relay over new slices, or in-session fixes on the run branch, the user's choice — leave the worktree standing for later, or discard it. The base branch changes only on your instruction; until then the relay's every commit sits on the run branch.

## Red flags — STOP

**Read the shared flags in [../../docs/engine-preflight.md](../../docs/engine-preflight.md) and stop on any of them.** In this engine "the graph" is the total order pre-flight sorts. This engine adds one:

- Two slices in flight at once in the shared worktree. One writer at a time, always: concurrent sub-agents overwrite each other's working tree and the run's history stops being recoverable.
- A slice dispatched while a descoped slice sits among its blockers — the work it builds on was never built, so what it produces is untestable against the tree pre-flight approved.

## Done when

Every box in [../../docs/engine-preflight.md](../../docs/engine-preflight.md)'s shared checklist — where the graph is the order it sorts into, and Stage 2's first act is the `git worktree add` — plus:

- [ ] The order is total: every slice has exactly one position, and every slice's blockers sit above it.
- [ ] The run branch, the base branch, the worktree path, the build command and the test command are written down, and every ignore rule in force is ruled disposable or kept with its reason.
- [ ] Exactly one worktree exists for this run, on the run branch, created by `git worktree add`.
- [ ] The closed-slice reconcile ran before the first dispatch, read each closure's reason, and sorted every closed slice into landed or descoped.
- [ ] Every slice that landed was closed only after its sub-agent reported `committed: true` with the SHA that the worktree's HEAD prints, and pre-flight's build command and test command both ran green there on the run branch.
- [ ] Every retry ran `reset --hard <green-mark>` then `clean -fd` before re-dispatching, plus `clean -fdx` scoped to the disposable paths whenever that list was non-empty.
- [ ] Any slice that exhausted its rungs has a structured blocker on its issue naming the total rungs spent on it across every run, and no slice below it in the order was dispatched.
- [ ] Every slice in the order is accounted for on exactly one of five counts: closed this run, reconciled as already landed, reconciled as descoped, blocked with its blocker on its issue, or below the blocker and undispatched.
- [ ] The end-of-run review returned a verdict, and it was relayed.
- [ ] The disposition was the user's choice, and the base branch is unchanged unless they chose to change it.
