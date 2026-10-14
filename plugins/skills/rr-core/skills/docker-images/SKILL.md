---
name: docker-images
description: Build Timebase container images locally, tagged so a workspace can actually find them — only the components that are needed, never pushed. Runs in a forked subagent and returns the tag and the list built; pass the tag and the components in the arguments.
context: fork
agent: general-purpose
---

# Build the images

Timebase images are **built from the repository and never published from a dev box**. A workspace
running `--target docker` consumes images that already exist locally; this skill produces them.

It runs forked — an hour of `docker buildx` output has no business in the caller's context. The
arguments name the tag (else `version.txt`'s `Release:`) and the components (else the ones a named
workspace file lists, else all seven) and whether `-no-cache` is wanted. There is no question this
skill could need to ask: pushing is not a decision it is allowed to make, so an argument asking for
it is refused in the report. It returns the §4 report.

Each image builds a .NET app *and* a Vite SPA, so budget **5–10 minutes per component**. Build only
what is actually needed.

## 1. Decide the tag first — it is what usually goes wrong

The workspace tool's `--image-tag` defaults to **its own product version** — the assembly's
informational version, stamped repo-wide from `version.txt`'s `Release:` line — and writes it into
the stack's `.env` as `TIMEBASE_VERSION`. A locally built image carries whatever tag was passed to
the publish script. Mismatch them and the stack hunts for `timebase/pulse:<product version>`, finds
nothing, and fails with "A Timebase image is missing locally".

So: pick the tag, use it for every component in one run, and **report it** so the stack can be
brought up with a matching `--image-tag`.

```powershell
$version = ((Get-Content .\version.txt | Select-String '^Release:') -split ':', 2)[1].Trim()
```

Use that when the stack will run on defaults; use an explicit tag (`e2e`, `latest`, a branch slug)
when several builds must coexist — just pass the same one to `--image-tag`.

## 2. Build

**One component** — from the repo root, in PowerShell. `-local` builds without pushing:

```powershell
./docker-publish.ps1 -path "Timebase.Pulse/src/Timebase.Pulse" -name "pulse" -version <tag> -local
```

The seven components and their paths (the list also lives in `docker-publish-all.ps1`'s
`$components`, and the two must stay in step):

| name | path |
|---|---|
| `historian` | `Timebase.Historian/src/Timebase.Historian` |
| `collector` | `Timebase.Collector/src/Timebase.Collector` |
| `explorer` | `Timebase.Explorer/src/Timebase.Explorer` |
| `pulse` | `Timebase.Pulse/src/Timebase.Pulse` |
| `connector` | `Timebase.Connector/src/Timebase.Connector` |
| `bridge` | `Timebase.Bridge/src/Timebase.Bridge` |
| `atlas` | `Timebase.Atlas/src/Timebase.Atlas` |

**All of them:**

```powershell
./docker-publish-all.ps1 -version <tag> -local
```

`./build.ps1 --target Docker` is the Cake build's Docker target and also builds every image, driven
by `build-manifest.json` and tagged from `version.txt`'s `Release:` — the only other thing in the
repo that builds them, and the right call when the stack will run on the default tag.

Which components a stack needs is what its workspace file names — `plan` lists them. A six-host
stack without Bridge does not need `bridge` built.

Add `-no-cache` only when a stale layer is actually suspected; it costs the full build time again.

## 3. Never push by default

Without `-local` these scripts **push to the registry**, multi-arch, which is a release action.
This skill never pushes: a release is a `build.md` step a person runs, not a stack-setup step, and a
forked skill has no way to confirm one. An argument asking for a push is reported as refused.

## 4. Report

```powershell
docker images "timebase/*" --format "{{.Repository}}:{{.Tag}}  {{.CreatedSince}}  {{.Size}}"
```

State the tag used, which components were built, which were skipped and why, and the
`--image-tag` value the stack must be given.

## Done when

- [ ] One tag was chosen for the whole run, and reported as the `--image-tag` to pass.
- [ ] Only the needed components were built, with the ones skipped named.
- [ ] `-local` was used on every build; nothing was pushed.
- [ ] `docker images` confirms each expected `timebase/<name>:<tag>` now exists.
