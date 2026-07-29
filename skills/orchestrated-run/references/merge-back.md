# Merge-back — SOURCE into BASE

Row 6 of the pipeline. Interactive, in this session: BASE was never touched during the run, so
this is a normal single-worktree operation — and every decision in it belongs to the user.

**The integrated set** — which slices landed — is the set of slices under the spec that read
CLOSED. Integration closes a slice only on a merge it built and verified on SOURCE, so CLOSED
*is* the merge record; nothing else about an integration is written to the tracker. In the
session that launched the workflow, the final report says the same thing (`integrated` /
`integrationOrder`) and adds the merge commits. What the merge will actually bring across:
`git log --oneline <BASE>..<SOURCE>`.

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

Ask for the go-ahead on *this* merge, of this SOURCE, into BASE as it stands now (the rule and the
rationalizations that erode it are in the skill body's "Merging into BASE"). Then, from BASE
(already checked out — the run never moved it):

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
