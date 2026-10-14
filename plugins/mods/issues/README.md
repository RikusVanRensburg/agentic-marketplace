# issues

The mechanical side of GitHub issue work, in code. A skill decides what an issue says and
whether two issues are duplicates; this mod runs the `gh` steps and checks that each one landed.

Every tool names its repo with `owner/name`, or uses the repo the session's folder is a clone of,
so it works from an org folder too.

## Install

```
/plugin marketplace add RikusVanRensburg/agentic-marketplace
/plugin install issues@agentic-marketplace
```

## Tools

| Tool | Does |
|---|---|
| `issue_labels` | Lists the repo's labels by family, the org's native issue types and the milestones. Changes nothing |
| `issue_create` | Creates an issue with labels, native type, assignee, parent, blocked-by and blocking edges and a milestone, then reads it back and errors on anything that did not land |
| `issue_fill` | Fills what is blank on an existing issue: body, assignee, a label per missing family, native type. Leaves what is there |
| `issue_link` | Puts issues under a parent as sub-issues and checks the whole set is listed |
| `label_ensure` | Creates labels a plugin owns. Refuses the repo's own taxonomy families |
| `issue_consolidate` | Plans closing a duplicate. Changes nothing |

What every tool holds to:

- Labels must already exist. The repo's taxonomy is never created by a tool.
- A native type is used only when the org has issue types; otherwise it is left off with a note.
- A milestone is attached only when it exists. None is ever created.
- A sub-issue link is checked against the parent's full, paginated list of children.
- Everything is checked before the first change, so a bad input changes nothing.

## Command

| Command | Does |
|---|---|
| `/issues` | Shows the planned consolidation, if any |
| `/issues consolidate` | Carries out the plan: carry the loser's content over, cross-link both, add the `duplicate` label if the repo has one, close the loser as not planned |
| `/issues consolidate cancel` | Drops the plan |

Closing an issue cannot be fully undone, so `/issues consolidate` runs only when the person types
it. A plan older than an hour is dropped.

## Options

| Option | Default | Is |
|---|---|---|
| `reservedFamilies` | `type:, scope:, state:` | Label families `label_ensure` refuses to create |
| `labelColor` | `1D76DB` | Color for labels `label_ensure` creates |
