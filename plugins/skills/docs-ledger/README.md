# docs-ledger

Keeps in-progress engineering docs inside the repo, in a ledger at `.ledger/`, so a later session
or agent picks up the current state cheaply instead of reading a pile of stale notes. The archivist
is the only writer: it sorts what is written into one structure and archives what a newer decision
replaced.

A mod for the mechanical side of this is planned; see `plugins/mods/archivist`.

## Install

```
/plugin marketplace add RikusVanRensburg/agentic-marketplace
/plugin install docs-ledger@agentic-marketplace
```

## Skills

| Skill | Use it to |
|---|---|
| `archivist` | Record or update context, decisions, design, plans, specs, test notes or current state, ask what the state of something is, or set up docs for a new piece of work |

## Agents

| Agent | Does |
|---|---|
| `archivist` | All reads and writes to `.ledger/`: picks the scope, creates, updates and splits documents, retrieves what was asked for, archives superseded decisions |

## Hooks

They act only in a repo that already has a `.ledger/` folder.

| Hook | Does |
|---|---|
| Session start | Asks for the active scope to be loaded, and clears the last session's markers |
| After Write or Edit | Queues a doc worth keeping, or asks for an immediate archivist run when a session is marked active |
| End of turn | Asks for the queue to be routed, once, when it is not empty |
