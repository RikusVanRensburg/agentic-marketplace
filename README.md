# agentic-marketplace

RR's personal Claude Code marketplace. It holds skill plugins and mods, and every one of them is a
plugin of its own: install only what you want, and update each on its own version.

## Install

Add the marketplace once:

```
/plugin marketplace add RikusVanRensburg/agentic-marketplace
```

Then install a plugin by name:

```
/plugin install <plugin>@agentic-marketplace
```

Pull new versions later with `/plugin marketplace update agentic-marketplace`.

## Plugins

### Skills

| Plugin | Holds |
|---|---|
| `rr-core` | Session setup: new and finished worktrees, Timebase stacks (up, down, find, update, images), starting, refreshing and finishing a piece of work, shipping a branch |
| `rr-stable` | Settled GitHub issue skills: triage for duplicates, quick issue filing |
| `rr-testing` | Skills still being tried out: archivist and its agent, confidence gate, branch docs consolidation, handover with three reviewer agents, prompt-master |
| `rr-workshop` | Run pipelines on GitHub Issues: wayfinding, spec, issues, test-first builds, Workflow fan-out and serial relay runs, plus grilling, findings defence, domain modelling, prototypes and the librarian |

### Mods

| Plugin | Does |
|---|---|
| `drive` | `/drive` keeps the drive's testing, docker and docs folders to their manifests, and cleans up only what you approve |
| `worktree-lifecycle` | `/wt` creates the branch and worktree, ships a draft PR on your yes, hears about the merge, housekeeps when you say so, and guards the bare-clone layout |
| `orchestrator` | Runs a multi-issue plan through subagents: dev and isolated QA per slice, one-at-a-time integration, final QA. Needs `worktree-lifecycle` |

Each mod's own README covers its commands, tools and options.

## Layout

```
.claude-plugin/marketplace.json   the catalog, one entry per plugin
plugins/<name>/                   skill plugins: skills/, agents/, commands/
mods/<name>/                      mods: hooks/, tests/, and a README
docs/adr/                         decision records
docs/specs/                       design specs
```

## Adding a plugin

1. Make a folder: `plugins/<name>/` for skills, `mods/<name>/` for a mod.
2. Give it a `.claude-plugin/plugin.json` with its name, version and description.
3. Add an entry to `.claude-plugin/marketplace.json` pointing at the folder.
4. Add a row to the tables above.

A new skill set or mod gets its own plugin, never a slot inside another one.

## Releasing a change

- Bump the plugin's version once per release, before the branch is pushed: patch for additions and
  fixes, minor for breaking changes. Installs only see a change when the version moves.
- Validate every plugin you touched, and the catalog:

  ```
  claude plugin validate plugins/<name>
  claude plugin validate .
  ```

- For a mod, run its tests too: `claude plugin test mods/<name>`.

## History

The plugins moved here from `flow-software/flow-agentic-resources` on 2026-10-14, with their git
history.
