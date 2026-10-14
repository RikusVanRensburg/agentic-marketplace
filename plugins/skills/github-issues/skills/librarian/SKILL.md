---
name: librarian
description: Archive repo docs into backdated, closed, commit-linked GitHub issues.
disable-model-invocation: true
---

Dispatch the **librarian** — the agent that shelves repo docs into GitHub issues keeping each
doc's original creation date. Your job is the dispatch, not the migration: resolve the inputs,
confirm them once, launch the agent, relay what comes back.

## 1. Resolve the inputs

The input contract is the **Your dispatch task provides** section of
[../../agents/librarian.md](../../agents/librarian.md). Read it, then ask the user about every
input there they have not already fixed. Where that section states a default and the user has no
preference, take the default and name the one you took.

**Done when** every input in that section has a resolved value — supplied by the user or
explicitly defaulted.

## 2. Confirm — the one gate

Echo the resolved inputs back in a single line and get an explicit go-ahead. This is the only
human gate in the run; the agent asks nothing once it is launched.

**Done when** the user has approved the inputs.

## 3. Dispatch

Agent tool, `subagent_type: github-issues:librarian`, with a task stating the confirmed inputs.

**Done when** the Agent call has returned.

## 4. Relay

The agent comes back one of two ways.

**It finished.** Report its summary concisely: each doc as created / skipped / failed with its
issue URL, plus whether the source files were removed.

**It stopped early.** The agent halts rather than guess — a missing path, an auth or `repo`-scope
gap, an absent `type:`/`scope:`/`state:` label, an import failure, a verification mismatch. Relay
its stop reason **verbatim**, name the single remedy that clears it (create the label, fix the
auth, resolve the mismatch), and hand it back for the user to carry out and re-run `/librarian`.
The taxonomy labels and milestones are theirs to create — the remedy is the user's work, the
report is yours.

**Done when** the branch you are in is fully reported: on a finish, every doc the agent named
carries its outcome and issue URL and the removal outcome is stated; on a stop, both the verbatim
reason and its remedy are on the table.
