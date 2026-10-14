#!/usr/bin/env bash
# docs-ledger:archivist ambient hook — SessionStart
# Per-repo opt-in: acts only if a .ledger/ exists at the repo root.
# Effect: auto-resume — instruct the agent to load the active scope's state via
# the archivist agent. Also clears stale per-session markers so each session
# starts in ambient (non-active) mode.

PLUGIN_ROOT="${1:-${CLAUDE_PLUGIN_ROOT:-}}"
input="$(cat)"

get() { printf '%s' "$input" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/"; }

cwd="$(get cwd)"; [ -z "$cwd" ] && cwd="$PWD"
root="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)"; [ -z "$root" ] && root="$cwd"
ledger="$root/.ledger"

# Always reset transient markers (mode + loop + queue) at session start.
rm -f "$ledger/.session-active" "$ledger/.flushing" "$ledger/.pending" 2>/dev/null

# Per-repo opt-out: no Ledger → stay completely silent.
[ -d "$ledger" ] || exit 0

refs="$PLUGIN_ROOT/skills/archivist/references"
msg="A managed Ledger exists at .ledger/. Before other work, use the docs-ledger:archivist skill: dispatch the archivist agent (LEDGER_REFS: $refs) to load the active scope's current state.md so you resume in context. Relay only its concise summary; do not pull the whole Ledger into context."

esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
m="$(esc "$msg")"
printf '{"additionalContext":"%s","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$m" "$m"
exit 0
