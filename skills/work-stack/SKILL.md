---
name: work-stack
description: Drive a stack on its own, with no worktree involved — see what is running, stand one up, update it, or remove it. For testing the branch already checked out or an installed release.
disable-model-invocation: true
---

# Stack, without a work session

The same stack leaves as `work-start` / `work-refresh` / `work-finish`, minus the worktree and the
delivery cycle. Use it to test the branch already checked out, an installed release, or somebody
else's stack.

## 1. Read the intent, then look before acting

Take the verb from the caller when given — *what is running*, *stand one up*, *update it*, *stop
it*, *remove it*. Otherwise infer it from state, and **say which you chose before doing it**:

```powershell
Get-ChildItem "<root>\local", "<root>\docker" -Directory -Filter "timebase_*"
```

Each stack folder's `rr-stack.json` names the branch and worktree it runs; read it before choosing.

| State and ask | Leaf |
|---|---|
| "what's running" / nothing named | `rr-core:stack-find` |
| No stack, and one is wanted | `rr-core:stack-up` |
| A stack exists and the code moved | `rr-core:stack-update` |
| Done with it | `rr-core:stack-down` — with *stop* or *remove* stated; the leaf will not guess |
| Docker target and images are missing or stale | `rr-core:docker-images` first |

**More than one stack and none named → list them and ask.** Never guess which stack a verb applies
to; they are isolated on purpose and someone else may be using one.

**Which leaves fork.** `stack-find`, `stack-up`, `stack-update` and `docker-images` run in a
subagent and cannot ask, so every decision is made here and passed in their arguments: the stack id,
the worktree, the root, the target, the ports, the tag, purge or not. Each returns a report block —
relay it. `stack-down` runs inline, because stop-versus-remove is a question, and this skill puts it
to the user before invoking the leaf.

## 2. Two things this skill does differently from `work-start`

- **No worktree is created.** The stack is built from the checkout you are already in, so whatever
  is committed or uncommitted there is what runs. Say which branch and commit that is when
  reporting, so a stack is never mistaken for a clean-branch build.
- **An installed release is a legitimate target.** To test what customers have rather than this
  branch, skip the build and point `--bin` at the install root — by default
  `C:\Program Files\Flow Software\Timebase`, one folder per component (`Historian\`, `Atlas\`, …),
  which is exactly the layout `LocalOrchestrator` looks for. Check it exists (`Test-Path`) first: a
  machine may have no install. **Do not omit `--bin`** hoping for the installed build: run from
  source, the tool's default resolves to nothing and `up` fails with "'…\Timebase.Atlas.exe' does not
  exist". Report the choice explicitly, because a stack silently running the wrong build is the
  failure `stack-up` guards against — and record `"bin"` and `"branch": "installed <version>"` in
  `rr-stack.json` so `stack-update` does not try to rebuild it.

## 3. Docker specifics

For `--target docker`, images must exist locally with the tag the stack will be given.
`rr-core:docker-images` decides the tag first and reports the `--image-tag` to pass — take it from
there rather than assuming the product version.

## 4. Report

- Which verb was chosen, and why, if it was inferred.
- The stack id, folder, target, ports and URLs.
- Which branch and commit — or which installed release — the binaries came from.
- For a removal: what was confirmed gone, and what was deliberately left.

## Done when

- [ ] The verb was stated before acting, and ambiguity between stacks was put to the user.
- [ ] The branch or build the stack runs was named in the report — never left implicit — and
      `--bin` was always explicit.
- [ ] For Docker, the image tag came from `docker-images` rather than an assumption.
- [ ] No worktree was created, and no other stack was touched.
