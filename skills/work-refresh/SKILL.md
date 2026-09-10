---
name: work-refresh
description: Put the current worktree's latest code under its running stack and re-prove it — stop, rebuild what changed, bring it back up on the same options, verify.
disable-model-invocation: true
---

# Refresh the stack

The loop skill: run it after each change to see that change in the running product. Data and client
secrets survive.

## 1. Find this worktree's stack

The stack was created from this worktree, and `stack-up` recorded that: enumerate `timebase_*`
folders under the root and match `rr-stack.json`'s `worktree` to `git rev-parse --show-toplevel`.
Nothing the tool itself writes names the worktree — `workspace-plan.json` has ports and components,
`processes.json` has pids. If `rr-stack.json` is missing, `(Get-Item "<root>\bin\<slug>\Atlas").Target`
says which worktree the junction points at; then write the file.

- **No stack for this worktree** → say so and offer `rr-core:work-start`. Do not stand a second one
  up silently.
- **More than one match** → list them and ask.

## 2. `rr-core:stack-update`

That leaf stops the stack, rebuilds the changed hosts per csproj (and re-stages a host's SPA when its
UI changed), brings it back up on the recorded command line without purging — so `.env` stays valid,
collected history survives, and Atlas recompiles the domain it already had — and re-runs `verify`
plus `--expect-values` against the recorded instance.

Two things not to do on a refresh:

- **Do not purge.** It regenerates every client secret and wipes the pre-seeded domain and the
  wiring. If a reset is genuinely wanted, say so and let the leaf handle it explicitly.
- **Do not change the image tag or the options** the stack came up with. A stack restarted on
  different options is no longer the stack that was tested.

## 3. Report what changed

- Which hosts were rebuilt, and from which commit.
- Whether the restart kept data and secrets (it should).
- The verification result, against the same instance as last time.
- Anything that got worse since the previous refresh — that is the signal this skill exists for.

Then stop. Reviewing the change in the product is the user's job.

## Done when

- [ ] The stack was matched to this worktree through `rr-stack.json`, not guessed at.
- [ ] Only changed hosts were rebuilt, and the restart preserved data and secrets.
- [ ] `verify` and `--expect-values` were re-run and reported against the same instance.
- [ ] Nothing was purged, retagged or re-optioned.
