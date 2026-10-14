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

Pull new versions later with `/plugin marketplace update agentic-marketplace`. The catalog in
`.claude-plugin/marketplace.json` lists every plugin on offer.

## Layout

```
.claude-plugin/marketplace.json     the catalog, one entry per plugin
plugins/
  skills/<name>/                    skill plugins
    .claude-plugin/plugin.json        name, version, description
    skills/<skill>/SKILL.md           one folder per skill
    agents/<agent>.md                 subagents the skills dispatch
    commands/                         slash commands, when a plugin has any
  mods/<name>/                      mods
    .claude-plugin/plugin.json        name, version, description, options
    hooks/hooks.json                  names the mod's one hooks module
    hooks/                            the hooks module and its code
    tests/                            unit tests, run by claude plugin test
    README.md                         the mod's commands, tools and options
docs/adr/                           decision records
docs/specs/                         design specs
```

Every plugin sits under `plugins/`, in the folder for its type: `skills/` or `mods/`.

A skill plugin groups skills that do one job. A mod changes Claude Code itself: commands, tools,
panes, bands and hooks, written as code. A mod that needs another lists it under `dependencies` in
its `plugin.json`; keep both in this marketplace.

## Adding a plugin

1. Make a folder for its type: `plugins/skills/<name>/` for skills, `plugins/mods/<name>/` for a mod.
2. Give it a `.claude-plugin/plugin.json` with its name, version and description.
3. Add an entry to `.claude-plugin/marketplace.json` pointing at the folder.

A new skill set or mod gets its own plugin, never a slot inside another one.

## Releasing a change

- Bump the plugin's version once per release, before the branch is pushed: patch for additions and
  fixes, minor for breaking changes. Installs only see a change when the version moves.
- Validate every plugin you touched, and the catalog:

  ```
  claude plugin validate plugins/<skills|mods>/<name>
  claude plugin validate .
  ```

- For a mod, run its tests too: `claude plugin test plugins/mods/<name>`.
