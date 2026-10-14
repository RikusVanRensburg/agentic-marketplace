# archivist

A placeholder. This mod will take over the mechanical side of the archivist skill in the
`docs-ledger` plugin, and does nothing yet. It is left out of the catalog until it does.

## To review before building

- **Is the current way efficient?** Three bash hooks run on session start, after every Write and
  Edit, and at the end of every turn. They keep their state in marker files inside `.ledger/`
  (`.session-active`, `.pending`, `.flushing`) and read the hook input with `grep`.
- **Does it make sure changes land?** Nothing stops a write into `.ledger/` that does not come from
  the archivist agent, although the skill says the archivist is the only writer.
- **Does it match how docs are kept now?** The ledger sits at each worktree's root in `.ledger/`.
  The mods keep their own manifests at `<repo>/.ledger/`, beside `.bare`, and the drive mod
  indexes documents under `D:\docs`. The two need to agree on where each kind of document lives.
- **What overlaps the librarian?** The librarian in `github-issues` archives repo docs into
  closed, backdated issues. Part of that may belong here, or in the issues mod.

## What it would hold

The parts that are the same every time: loading the active scope at session start, queueing
written docs, flushing the queue at turn end, and guarding `.ledger/`. Curating the ledger itself
stays with the archivist agent, since it takes judgment.
