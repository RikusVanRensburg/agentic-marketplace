---
name: librarian
description: "Archive repo docs into backdated, closed, commit-linked GitHub issues. User-invoked: run /librarian."
disable-model-invocation: true
---

The front door to the **librarian** — the archival migration that shelves repo docs into GitHub
issues keeping their original creation date. This skill is **user-invoked only**: it runs when you
type `/librarian`, never on its own. Gather the inputs, confirm them once, dispatch the autonomous
`librarian` agent, and relay its report.

## 1. Gather inputs

Ask the user for anything not already supplied:
- **paths** — the docs or folders to migrate (required; if absent, ask before continuing).
- **anchor** — `first-add` (default) or `latest`.
- **scope** label (default `scope: rr`), **state** label (default `state: needs-triage`),
  optional **type**.
- **delete-after** — whether to `git rm` the migrated files once their issues verify (default: no).
- **repo** — defaults to the current clone.

## 2. Confirm — the one gate

Echo the resolved inputs back in a single line (paths, anchor, labels, delete-after) and get an
explicit go-ahead. This dispatch-time confirmation is the only gate; the agent runs unattended
once launched. **Done when** the user has approved the inputs.

## 3. Dispatch the agent

Launch the **librarian** agent (Agent tool, `subagent_type: librarian`) with a task stating the
confirmed inputs. It runs the whole migration unattended — import each doc as a backdated closed
issue via the golden-comet Issue Import API, build the folder→parent / file→sub-issue tree, verify
every issue against live GitHub, and remove the source files only if delete-after was set and the
verification passed.

## 4. Relay

Report the agent's summary concisely: created / skipped / failed with issue URLs, and whether any
files were removed. Do not redo its work.
