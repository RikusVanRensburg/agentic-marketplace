---
name: stack-update
description: Roll a running Timebase stack onto newer code — stop it, rebuild what changed, bring it back up on the same options, and re-prove it — keeping its data and client secrets unless a reset is explicitly asked for.
---

# Update a running stack

Put newer code under a stack that is already up, and prove it still works. **Data and credentials
survive by default** — wiping them is a separate, explicit request, because it regenerates every
client secret the stack has and throws away the wired content.

Every workspace verb below takes `--config <stack>/workspace.config --workspace-dir <stack>`; the
tool's `--workspace-dir` default is a `.workspace` beside the config, which is not where the stack is.

## 1. Identify the stack, and never guess between two

```powershell
Get-ChildItem "<root>\local", "<root>\docker" -Directory -Filter "timebase_*"
```

Read, per candidate:

| File | Written by | Recovers |
|---|---|---|
| `rr-stack.json` | `stack-up` | branch, worktree, commit, `--bin`, port offset, the exact `up` command line, the proven instance |
| `workspace-plan.json` | the tool | name, auth, certs, every component's ports (offset = published − default) |
| `processes.json` | the tool, `--target local` only | the pids — its presence is how `down` decides the target |
| `.env` | the tool | secrets; for Docker also `TIMEBASE_VERSION`, the image tag |

**Nothing the tool writes records `--bin`.** If `rr-stack.json` is missing, recover it from a live
process — `Get-CimInstance Win32_Process -Filter "ProcessId=<pid from processes.json>"` gives the exe
path under `<bin>\<InstallFolder>\`, and `(Get-Item "<bin>\Atlas").Target` gives the worktree the
junction points at — then write `rr-stack.json` so the next run does not have to.

More than one stack, and none named by the caller → list them and ask.

## 2. Stop before you build

**`down` first, then build.** Windows will not overwrite a DLL a running process has loaded, so a
`dotnet build` into a folder the stack is running from fails with a file-in-use error partway
through and leaves a half-updated output. Read `processes.json` before `down` if you want the pids
for step 4 — `down` clears it.

```sh
dotnet run --project . -- down --config <stack>/workspace.config --workspace-dir <stack>
```

`down` without `--purge` keeps everything: data, `.env`, the wired content.

## 3. Rebuild what changed

**`--target local`** — per csproj, never via the `.slnx`:

```sh
dotnet build Timebase.<Host>/src/Timebase.<Host>/Timebase.<Host>.csproj -c Debug
```

If `--bin` is junctions into these build outputs (how `stack-up` assembles it), the new binaries are
in place with nothing to copy. If UI code changed, rebuild that host's SPA and re-stage it —
`pnpm --dir Timebase.<Host>/src/Timebase.<Host>.UI run build`, then copy `dist/*` over
`bin/Debug/net10.0/wwwroot/` — because the dotnet build never produces `wwwroot/` (see `stack-up`).
If `--bin` was a copy or a publish, refresh it and say so.

**`--target docker`** — rebuild the images for the changed components **with the tag the stack is
already using** (`TIMEBASE_VERSION` in `.env`), then let `up` recreate the containers. Building
under a new tag means also passing a new `--image-tag`, which is a change to the stack's
definition — do one or the other, not half of each.

## 4. Up again — on the same options

There is no `restart` verb; `up` after `down` is the restart, and the flags decide what survives.

```sh
dotnet run --project . -- up <exactly the command line rr-stack.json recorded>
```

- Pass the same options the stack came up with: target, workspace-dir, bin, auth, certs, port
  offset, image tag. A stack silently restarted on different options is no longer the stack that was
  tested. `verify` and `down` read the rendered plan and cannot tell you this went wrong.
- **Without `--purge` / `--fresh`, data and secrets are kept**, which is what an update wants:
  `.env` stays valid, the collected history survives, and Atlas recompiles the domain it had
  compiled before (`AutoRecompileOnStartup`, deferring it until its connector is back) — the wired
  content comes back on its own.
- **A wipe is `down --purge`.** For Docker it removes the volumes; for a local stack it deletes each
  `<stack>/<service>/` root (logs, `.env` and the plan stay). Pulse then regenerates every client
  secret on the next start. `up --fresh` is the **Docker-only** spelling of the same thing
  (`compose down -v` first); on a local target it is accepted and ignored. Only on an explicit
  instruction, and say what it costs before doing it.

## 5. Re-apply content only if it was wiped

An ordinary restart keeps everything. **After a purge it is all gone** — the pre-seeded Atlas
domain, the Collector's dataset and example, the Connector's alias and Atlas link — and `.env` is
stale. Redo `stack-up` steps 6 and 8 in full before verifying, with the new secrets, and remember
all three components have to agree or every value silently resolves to nothing.

## 6. Re-prove it

```sh
dotnet run --project . -- verify --config <stack>/workspace.config --workspace-dir <stack>
dotnet run --project . -- verify --config <stack>/workspace.config --workspace-dir <stack> \
  --expect-values <the instance rr-stack.json recorded>
```

An update that cannot be verified is not finished. Use the same instance the stack was originally
proved with, so the comparison means something. Update `commit` in `rr-stack.json`.

## 7. Report

- Which stack, which components were rebuilt, and from which branch and commit.
- Whether data and secrets were kept or reset.
- The verification result, and anything that changed since the previous run.

## Done when

- [ ] The stack was identified from `rr-stack.json` and the tool's own files, not from assumption —
      and `rr-stack.json` was written if it was missing.
- [ ] `down` ran before the build, and only the changed components were rebuilt, per csproj (SPA
      re-staged when UI code changed); the image tag was left alone unless the change was intended.
- [ ] `up` used the recorded command line, with `--workspace-dir`.
- [ ] Data and secrets were kept, or a purge was explicitly asked for, its cost stated first, and
      the content re-applied.
- [ ] `verify` plus `--expect-values` passed afterwards against the recorded instance.
