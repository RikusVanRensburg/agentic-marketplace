# agentic-marketplace

RR's personal plugin marketplace. Skill plugins live in `plugins/<name>/`, mods in `mods/<name>/`,
and each one is its own entry in `.claude-plugin/marketplace.json`. A new skill set or mod gets its
own folder and its own entry, never a slot inside another plugin.

## Versions

Bump `<folder>/.claude-plugin/plugin.json` once per release, before the branch carrying the change
is pushed: patch for additions and fixes, minor for breaking changes. Installs only see a change
when the version moves.

## Checks

Before every commit that touches a plugin or the catalog:

```bash
claude plugin validate <folder>
claude plugin validate .
```

For a mod, also run its tests:

```bash
claude plugin test mods/<name>
```

## Branches

`<type>/RVR/<kebab-description>`, lowercase type: feat, fix, docs, chore, refactor, test.
