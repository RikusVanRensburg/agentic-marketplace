# drive

Keeps three folders on the drive to their manifests: `testing` (isolated test runs), `docker`
(compose stacks and their volumes) and `docs` (notes and investigations). Each folder has a
`manifest.md` with one row per run, stack or document, and this mod keeps the rows and the folders
moving together, so nothing is created, renamed or deleted by hand.

## Install

```
/plugin marketplace add RikusVanRensburg/agentic-marketplace
/plugin install drive@agentic-marketplace
```

## Command

| Command | Does |
|---|---|
| `/drive check` | Reports what is stale, untracked or misnamed. Changes nothing |
| `/drive clean` | Shows the cleanup plan, numbered |
| `/drive clean apply [1,3,5-7]` | Carries out the plan, or the numbered part of it |
| `/drive run new <product> <run> "<what>"` | Makes a test run folder and its row |
| `/drive run status <product>/<run> <running\|done\|abandoned> ["<note>"]` | Sets a run's status |
| `/drive run remove <product>/<run>` | Stops what runs from it, deletes it, drops its row |
| `/drive stack new <products\|support> <repo> <slug> "<what>"` | Makes a stack's compose and volumes folders and its row |
| `/drive stack sync [<stack>]` | Records ports from the compose files and reports rule breaks |
| `/drive stack remove <stack>` | Composes it down, deletes its folders, drops its row |
| `/drive doc add <path> "<what>"` | Indexes a document under `docs` |
| `/drive doc status <path> <current\|superseded\|abandoned>` | Sets a document's status |

## Tools

| Tool | Does |
|---|---|
| `testing_run` | New, status and remove for test runs |
| `docker_stack` | New, sync and remove for stacks |
| `docs_index` | Add and status for documents |
| `drive_check` | The same report as `/drive check` |

No tool cleans up. The cleanup runs only from `/drive clean apply`.

## What it holds to

- A manifest is never edited by hand: a Write or Edit on one is refused and pointed at the tool.
- The cleanup takes what the manifest marks done, abandoned or superseded, plus test runs left
  running untouched, and stacks left up, longer than the stale limit. Anything not in a manifest
  is reported, never removed.
- Folders named `archive` under `docs` are left out of the cleanup.
- At session start, a toast says when there is something to clean.

## Options

| Option | Default | Is |
|---|---|---|
| `driveRoot` | `D:/` | The drive holding `testing`, `docker` and `docs` |
| `staleDays` | `7` | How long a running test run can sit untouched, or a stack stay up, before the cleanup takes it |
| `nudge` | on | The toast at session start |
