# agentic-marketplace

RR's personal Claude Code marketplace. Every skill set and every mod is its own plugin, installed on
its own.

```
/plugin marketplace add RikusVanRensburg/agentic-marketplace
/plugin install <plugin>@agentic-marketplace
```

## Plugins

| Plugin | Kind | Does |
|---|---|---|
| `rr-core` | skills | Session setup: worktrees, stacks, start and finish work, ship |
| `rr-stable` | skills | Settled workflows: issue triage, quick issues |
| `rr-testing` | skills | Skills still being tried out: archivist, handover, prompt-master and more |
| `rr-workshop` | skills | Run pipelines on GitHub Issues, from wayfinding to implementation |
| `drive` | mod | `/drive` keeps the drive's testing, docker and docs folders to their manifests |
| `worktree-lifecycle` | mod | `/wt` starts work, ships a draft PR on your yes, hears about the merge, housekeeps, guards the layout |
| `orchestrator` | mod | Runs a multi-issue plan through subagents; needs `worktree-lifecycle` |

## Layout

```
.claude-plugin/marketplace.json   the catalog
plugins/<name>/                   skill plugins
mods/<name>/                      mods, one plugin each
docs/adr/                         decision records
docs/specs/                       design specs
```

The plugins moved here from flow-software/flow-agentic-resources on 2026-10-14, history included.
