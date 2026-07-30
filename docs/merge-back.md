# Merge-back — SOURCE into BASE

Row 6 of the pipeline, shared by both routers: the merge is the run's one irreversible act on the
human's branch, and every decision in it belongs to the user. Interactive, in this session.

Written in the Workflow path's vocabulary. **On a relay run** — driven by `rr-workshop:relay-run` —
read the closing "On the relay path" section first: it remaps that vocabulary and narrows the
claims that read differently there.

**The integrated set** — which slices landed — is the set of slices under the spec that read
CLOSED. Integration closes a slice only on a merge it built and verified on SOURCE, so CLOSED
*is* the merge record; nothing else about an integration is written to the tracker. In the
session that launched the workflow, the final report says the same thing (`integrated` /
`integrationOrder`) and adds the merge commits. What the merge will actually bring across:
`git log --oneline <BASE>..<SOURCE>`.

## Row 6 or finished — the branch-state test

`git merge-base --is-ancestor <SOURCE> <BASE>` exits **0** when BASE already carries SOURCE's
commits: the merge is done, so with every slice closed the run is **finished** — say so, and start
nothing. A **non-zero** exit — BASE lacks those commits — is what puts the run on row 6, and the
steps below are what it enters.

## 1. Surface the verdict — before any merge

Put the final-review outcome in front of the user first:

- **Clean verdict** → proceed to the merge (step 3).
- **Outstanding blockers** (survived remediation): name them. SOURCE still contains every
  integrated slice's work regardless of the verdict — per-slice QA already gated each one
  individually — so the user decides: **fix first** (step 2), **merge as-is and fix forward**
  (step 3), or **hold**.
- **Verdict unavailable** (resumed session — the report died with its session): say so. Either
  relaunch `rr-workshop:orchestration` against the SAME SOURCE — its reconcile skips every landed
  slice, so the relaunch ends in a fresh final review — or merge without a verdict on the user's
  explicit say-so.
- **Hold**: record it — a comment on the spec noting the hold, the outstanding blockers, and that
  SOURCE stands intact. The tree stays open; resolution lands back on row 6 next session. Stop.

## 2. Fix blockers first (when the user chooses to)

Per structured blocker: grill the user via `rr-workshop:grilling` until it is resolved, then
relaunch `rr-workshop:orchestration` with the resume channel — `answers` (issue number →
clarification; the literal key `FINAL` carries final-review guidance), `integrated` (the
already-merged issue numbers), `finalReviewDone` when a prior run delivered the verdict —
targeting the **same SOURCE**: never recreate it, never reset it. When the relaunch returns,
start over at step 1 with the new report.

## 3. Merge — on the go-ahead

Ask for the **go-ahead on *this* merge** — of this SOURCE, into BASE as it stands now — in this
session, and resolve every conflict alongside the user. These are the rationalizations that erode
that rule; each router adds any that are its own:

| Excuse | Reality |
|---|---|
| "They approved the launch — that covers the merge." | The launch gate approved a graph, given before a line of code existed and before any verdict on it. It authorizes spending agents on that graph, and reaches as far as SOURCE and no further. |
| "They said merge it last session." | The go-ahead is for this SOURCE against BASE *as it stands now*. Either branch moving retires it. Re-ask; it costs one message. |
| "The conflict is trivial." | A conflict means BASE moved under the run. Whoever moved it knows why, and you do not. Resolve it with them, hunk by hunk. |
| "`--ff-only` refused, so I'll force it / reset BASE to SOURCE." | Force discards commits on the human's branch that the run never saw. There is no state of this pipeline where that is the right move. |
| "I'll merge and tell them — it's revertible." | Reverting a merge on a shared branch is a second public event, not an undo. |

On the go-ahead, from BASE (already checked out — the run never moved it):

1. `git merge --ff-only <SOURCE>` first — the common case, since BASE usually hasn't moved during
   the run.
2. If BASE advanced and ff-only refuses: a normal `git merge <SOURCE>`, every conflict resolved
   **with the user** — never force, never guess a resolution.

## 4. Post the review trail on the spec

One comment on the **spec issue** carrying the final-review findings — blockers, nits, verdict —
and the merge commit. The tree is the ledger: the findings live here, not in a file.

## 5. Close the tree — verify the slices, close the parents

Integration already closed every slice it merged, so the slices are a **check**, not an action:
confirm every slice under the spec reads CLOSED (`gh issue list`, or `gh issue view <n> --json
state` per slice). A slice still open was never integrated — it is a fix-forward remainder, and
the parents stay open with it, so a later session routes back here.

Closing a child never auto-closes its parent, so each parent closes explicitly,
`gh issue close <n> --reason completed`:

1. **The spec** — only when no slice under it remains open.
2. **The map**, when the run has one.

## 6. The integration branch — ask, don't assume

Once fully merged, **ask** the user before `git branch -d <SOURCE>` — a deleted branch is easy to
recover only while the reflog holds it, so deletion is theirs to call.

**Only when the run kept its own worktree on SOURCE** — `git worktree list` shows a second worktree
checked out on SOURCE, as a relay run's does and a `Workflow` run's never does — that worktree is
part of the same ask, and its removal comes first: git refuses to delete a branch still checked out
in another worktree. `git worktree remove <path>`, then `git branch -d <SOURCE>`. A removal that
refuses on uncommitted changes is work the run never committed: show the user `git -C <path> status`
and let them call it.

## On the relay path

A run driven by `rr-workshop:relay-run` reads everything above with its vocabulary remapped and
four of its claims narrowed:

- **Vocabulary.** SOURCE is the **run branch**, BASE is the **base branch**, and a relaunch is
  `rr-workshop:relay-implement` against the same run branch.
- **A second worktree is expected.** The relay's shared worktree stands on the run branch for the
  whole run, so the merge runs alongside it — §6 covers removing that worktree.
- **No per-slice independent QA gated the landed work.** A relay verifies each slice itself and
  first reaches independent `opus` judgement at the end-of-run review, so §1's fix-first /
  merge-as-is / hold choice rests on that one review alone.
- **CLOSED means committed green on the run branch** — the relay's own close after a clean build
  and a green full suite, a narrower claim than a verified merge onto an integration branch, and
  the run branch is the only branch the run touches. There is no per-slice merge commit and no
  final report, so §1's `integrated` / `integrationOrder` fields and §5's "Integration already
  closed every slice it merged" both read as that close.
- **The resume channel is Workflow-only.** §2's `answers` / `integrated` / `finalReviewDone` are
  `orchestration.js`'s args contract; the relay's relaunch carries none of them and reconciles the
  landed slices itself.
