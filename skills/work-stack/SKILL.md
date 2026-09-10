---
name: work-stack
description: Drive a stack on its own, with no worktree involved — see what is running, stand one up, update it, or remove it. For testing an existing branch or a released build.
disable-model-invocation: true
---

# Stack, without a work session

The same stack leaves as `work-start` / `work-refresh` / `work-finish`, minus the worktree and the
delivery cycle. Use it to test the branch already checked out, a released build, or somebody else's
stack.

## 1. Read the intent, then look before acting

Take the verb from the caller when given — *what is running*, *stand one up*, *update it*, *remove
it*. Otherwise infer it from state, and **say which you chose before doing it**:

```powershell
Get-ChildItem "<root>\local", "<root>\docker" -Directory -Filter "timebase_*"
```

| State and ask | Leaf |
|---|---|
| "what's running" / nothing named | `rr-core:stack-find` |
| No stack, and one is wanted | `rr-core:stack-up` |
| A stack exists and the code moved | `rr-core:stack-update` |
| Done with it | `rr-core:stack-down` |
| Docker target and images are missing or stale | `rr-core:docker-images` first |

**More than one stack and none named → list them and ask.** Never guess which stack a verb applies
to; they are isolated on purpose and someone else may be using one.

## 2. Two things this skill does differently from `work-start`

- **No worktree is created.** The stack is built from the checkout you are already in, so whatever
  is committed or uncommitted there is what runs. Say which branch that is when reporting, so a
  stack is never mistaken for a clean-branch build.
- **A released build is a legitimate target.** To test what customers have rather than this branch,
  pass no `--bin` and let the leaf use the installed Timebase — but report that choice explicitly,
  because a stack silently running the installed build is the failure `stack-up` guards against.

## 3. Docker specifics

For `--target docker`, images must exist locally with the tag the stack will be given.
`rr-core:docker-images` decides the tag first and reports the `--image-tag` to pass — take it from
there rather than assuming the product version.

## 4. Report

- Which verb was chosen, and why, if it was inferred.
- The stack id, folder, target, ports and URLs.
- Which branch or build the binaries came from.
- For a removal: what was confirmed gone, and what was deliberately left.

## Done when

- [ ] The verb was stated before acting, and ambiguity between stacks was put to the user.
- [ ] The branch or build the stack runs was named in the report — never left implicit.
- [ ] For Docker, the image tag came from `docker-images` rather than an assumption.
- [ ] No worktree was created, and no other stack was touched.
