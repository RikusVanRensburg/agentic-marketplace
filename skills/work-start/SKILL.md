---
name: work-start
description: Start a piece of work — a worktree off the branch you are on, plus an isolated stack running its binaries — and hand back the branch, the stack id and every URL.
disable-model-invocation: true
---

# Start work

Two leaves, in order, and then stop. This skill decides nothing the leaves already decide; its job
is the sequence and the handover.

## 1. Resolve the inputs once, up front

| Input | Default |
|---|---|
| description / branch name | ask if not given |
| base branch | the branch this session is on — never hard-coded |
| root folder | `D:\test` |
| target | `local` |
| ports | a free block, chosen and reported |

State the plan on one line — branch, worktree path, target, root — and confirm it if the branch name
had to be derived. Then run the two leaves without asking again.

## 2. `rr-core:worktree-new`

Creates the worktree. It reads the repo's own `CLAUDE.md` rules for layout and naming, so nothing
about paths is decided here.

**One worktree per stream of work.** If a worktree for this work already exists, that leaf reuses
it — do not open a second for the next change.

## 3. `rr-core:stack-up`

Run **from the new worktree**, so the stack is built from this branch. That leaf builds per csproj,
assembles `--bin`, brings the workspace up under `<root>\local\timebase_<4 hex>`, applies the Food &
Beverage content and proves values resolve.

If it stops on something — a port block in use, a build failure, a content step that cannot be
confirmed — report that and stop. A half-built stack is worth naming, not working around.

## 4. Hand over, then stop

Report, in one block:

- branch and worktree path
- stack id, folder, and target
- every host's URL, and the ports if they were not the caller's
- that secrets are in `<stack>\.env`, and whether the CA was imported
- the instance whose values came back Good
- what to run next: `rr-core:work-refresh` after each change, `rr-core:work-finish` at the end

Then **stop**. This skill sets the session up; it does not start the work.

## Done when

- [ ] The base branch was the one the session was on.
- [ ] Both leaves ran in order, from the new worktree, and neither was second-guessed.
- [ ] The handover block names the branch, the stack id, the URLs and the proven instance.
- [ ] No code was changed and no work was begun.
