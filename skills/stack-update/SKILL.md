---
name: stack-update
description: Roll a running Timebase stack onto newer code — rebuild what changed, restart it, and re-prove it — keeping its data and client secrets unless a reset is explicitly asked for.
---

# Update a running stack

Put newer code under a stack that is already up, and prove it still works. **Data and credentials
survive by default** — wiping them is a separate, explicit request, because it regenerates every
client secret the stack has.

## 1. Identify the stack, and never guess between two

```powershell
Get-ChildItem "<root>\local", "<root>\docker" -Directory -Filter "timebase_*"
```

Each stack folder holds `workspace-plan.json` (what it was rendered from), `.env` (its secrets) and,
for `--target local`, `processes.json` (exactly what was started). Read the plan to recover the
target, the ports, the components and the `--bin` it was given, rather than re-deriving them.

More than one stack, and none named by the caller → list them and ask.

## 2. Rebuild what changed

**`--target local`** — rebuild the hosts that changed, per csproj, never via the `.slnx`:

```sh
dotnet build Timebase.<Host>/src/Timebase.<Host>/Timebase.<Host>.csproj -c Debug
```

If the stack's `--bin` was assembled as junctions into these build outputs, the new binaries are
already in place — there is nothing to copy, only a restart to do. If it was a copy or a publish,
refresh it and say so.

**`--target docker`** — rebuild the images for the changed components **with the tag the stack is
already using** (read it from the plan), then let the restart recreate the containers. Building
under a new tag means also passing the new `--image-tag`, which is a different change to a stack's
definition — do one or the other, not half of each.

## 3. Restart

There is no `restart` verb: it is `down` then `up`, and the flags decide what survives.

```sh
dotnet run --project . -- down --config <stack>/workspace.config
dotnet run --project . -- up   --config <stack>/workspace.config <the plan's own options>
```

- **Without `--purge` / `--fresh`, data and secrets are kept**, which is what an update wants:
  `.env` stays valid and the history the stack has collected survives.
- **`down --purge` (or `up --fresh`) wipes it** — for Docker the volumes, for local the component
  directories inside the workspace — and Pulse then regenerates every client secret on next start.
  Only on an explicit instruction, and say what it costs before doing it.
- Pass the same options the stack came up with (target, workspace-dir, bin, auth, certs, port
  offset). A stack silently restarted on different options is no longer the stack that was tested.

Atlas recompiles its domains on every start, so a restart does not lose the commissioned world.

## 4. Re-apply content only if it was wiped

An ordinary restart keeps everything, so the Simulator example, the commissioned Atlas domain and
the Connector alias are all still there. **After a purge they are gone** — redo those three steps
(see `stack-up`) before verifying, and remember all three have to agree or every value silently
resolves to nothing.

## 5. Re-prove it

```sh
dotnet run --project . -- verify --config <stack>/workspace.config
dotnet run --project . -- verify --config <stack>/workspace.config --expect-values <domain>/<instance>
```

An update that cannot be verified is not finished. Use the same instance the stack was originally
proved with, so the comparison means something.

## 6. Report

- Which stack, which components were rebuilt, and from which branch and commit.
- Whether data and secrets were kept or reset.
- The verification result, and anything that changed since the previous run.

## Done when

- [ ] The stack was identified from its own `workspace-plan.json`, not from assumption.
- [ ] Only the changed components were rebuilt, per csproj, and the image tag was left alone unless
      the change was intended.
- [ ] The restart used the same options the stack came up with.
- [ ] Data and secrets were kept, or a purge was explicitly asked for and its cost stated first.
- [ ] Content was re-applied if and only if it was wiped, and `verify` plus `--expect-values` passed
      afterwards.
