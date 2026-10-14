# github-issues

Skills for filing, triaging and archiving GitHub issues. The skills decide what an issue says and
whether two issues are duplicates. The `issues` mod does the `gh` steps and checks they landed, so
this plugin depends on it.

## Install

```
/plugin marketplace add RikusVanRensburg/agentic-marketplace
/plugin install issues@agentic-marketplace
/plugin install github-issues@agentic-marketplace
```

## Skills

| Skill | Use it to |
|---|---|
| `quick-issue` | File an issue whose content is already clear, or flesh out a thin one in place. Every issue ends as Problem, Context and Acceptance criteria, with labels, native type and assignee set |
| `issue-triage` | Check an issue for a genuine duplicate on the tracker. A match is treated as a finding to defend, you pick which issue survives, and the close waits for your `/issues consolidate` |
| `librarian` | Archive repo docs as backdated, closed GitHub issues linked to their commits, after you confirm what goes |

## Agents

| Agent | Does |
|---|---|
| `librarian` | The archiving itself, dispatched by the `librarian` skill |

## Also here

`docs/github-operations.md`: the shared `gh` notes, including how the `type:` label maps to the
native issue type.
