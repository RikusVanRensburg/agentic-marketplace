# Merge-back — SOURCE into BASE

Stage 5 of the pipeline. Interactive, in this session. Everything integrated sits on **SOURCE**
(the dedicated integration branch); **BASE** — the human's branch — was never touched during the
run, so merging is a normal single-worktree operation here, and every decision in it belongs to
the user.

**The integrated set** — which slices landed — comes from the workflow's final report
(`integrated` / `integrationOrder`) in the session that ran it, or, on a resumed session, from the
"integrated into `<SOURCE>` at `<sha>`" comment on each slice. In doubt, confirm a sha landed:
`git merge-base --is-ancestor <sha> <SOURCE>`.

## 1. Surface the verdict — before any merge

Put the final-review outcome in front of the user first:

- **Clean verdict** → proceed to the merge (step 3).
- **Outstanding blockers** (survived remediation): name them. The integration branch still
  contains every integrated slice's work regardless of the verdict — per-slice QA already gated
  each one individually — so the user decides: **fix first** (step 2), **merge as-is and fix
  forward** (step 3), or **hold**.
- **Verdict unavailable** (resumed session — the report died with its session): say so. Either
  relaunch `rr-workshop:orchestration` against the SAME SOURCE — its reconcile skips every landed
  slice, so the relaunch ends in a fresh final review — or merge without a verdict on the user's
  explicit say-so.
- **Hold**: record it — a comment on the spec noting the hold, the outstanding blockers, and that
  SOURCE stands intact. The tree stays open; stage resolution lands back here next session. Stop.

## 2. Fix blockers first (when the user chooses to)

Per structured blocker: grill the user via `rr-workshop:grilling` until it is resolved, then
relaunch `rr-workshop:orchestration` with the resume channel — `answers` (issue number →
clarification; the literal key `FINAL` carries final-review guidance), `integrated` (the
already-merged issue numbers), `finalReviewDone` when a prior run delivered the verdict —
targeting the **same SOURCE**: never recreate it, never reset it. When the relaunch returns,
start over at step 1 with the new report.

## 3. Merge

From BASE (already checked out — the run never moved it):

1. `git merge --ff-only <SOURCE>` first — the common case, since BASE usually hasn't moved during
   the run.
2. If BASE advanced and ff-only refuses: a normal `git merge <SOURCE>`, every conflict resolved
   **with the user** — never force, never guess a resolution.

## 4. Post the review trail on the spec

One comment on the **spec issue** carrying the final-review findings — blockers, nits, verdict —
and the merge commit. The tree is the ledger: the findings live here, not in a file.

## 5. Close the tree — children before parents

Closing a child never auto-closes its parent, so every close is explicit, each
`gh issue close <n> --reason completed`:

1. **Every integrated slice** (skip any a `closeOnIntegrate: true` run already closed), with a
   closing comment linking the merge.
2. **The spec** — only when no slice under it remains open. If unintegrated slices remain (the
   user merged as-is to fix forward), they stay open, and the spec and map stay open with them —
   stage resolution routes a later session back to them.
3. **The map**, when the run has one.

Require before moving on: every issue in the integrated set reads CLOSED.

## 6. The integration branch — ask, don't assume

Once fully merged, **ask** the user before `git branch -d <SOURCE>` — a deleted branch is easy to
recover only while the reflog holds it, so deletion is theirs to call.
