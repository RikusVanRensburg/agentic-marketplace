<plugin-versioning>
## Plugin Version Bumping

Any time you modify a plugin's contents (skills, agents, scripts, config, or any file under a
`plugins/{name}/` directory), the version in that plugin's `.claude-plugin/plugin.json` MUST be
bumped before that change is **published**: before the branch carrying it is merged or pushed.

**One bump per release, not one per commit.** A work-in-progress commit on a feature branch is
never something a consumer can pull, so bumping on every commit turns the version into a commit
counter and protects nobody. Group the work into whatever commits read best and move the version
once, in the last of them.

Because that removes the per-commit forcing function, treat the bump as part of finishing a branch:
no branch touching `plugins/` is done until its plugin's version has moved.

**Version file location:** `plugins/{plugin-name}/.claude-plugin/plugin.json`

**Version field:** `"version": "X.Y.Z"`. Increment the patch number (Z) for additions and fixes,
the minor number (Y) for breaking changes to existing skills.

Mods live in `mods/{mod-name}/` and follow the same rule: bump `mods/{mod-name}/.claude-plugin/plugin.json`.

This is how users receive updates: they run `/plugin marketplace update`, which pulls the latest
version. If you forget to bump, nobody gets the change.
</plugin-versioning>

<plugin-validation>
## Plugin Validation

Any time you modify a plugin or marketplace configuration, run the built-in validation before
committing:

```bash
claude plugin validate plugins/{name}
```

The path argument is required: a bare `claude plugin validate` errors on current CLI versions
(confirmed on 2.1.220).

This validates `plugin.json` schema, skill/agent/command frontmatter, and hook configuration.
Unlike the version bump, run this on **every** commit that touches a plugin: it is cheap, and it
catches a broken manifest at the commit that broke it rather than thirty commits later.
</plugin-validation>
