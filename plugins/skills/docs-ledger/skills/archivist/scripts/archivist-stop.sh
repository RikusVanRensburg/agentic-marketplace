#!/usr/bin/env bash
# docs-ledger:archivist ambient hook — Stop (fires at the END OF EVERY TURN, not just session end)
# Per-repo opt-in: acts only if a .ledger/ exists at the repo root.
# Only blocks when there is queued, unrouted work (.ledger/.pending non-empty), so it
# stays silent on ordinary turns. Loop-guarded by a .flushing marker so it blocks at
# most once per consecutive stop regardless of what the agent does.

PLUGIN_ROOT="${1:-${CLAUDE_PLUGIN_ROOT:-}}"
input="$(cat)"

get() { printf '%s' "$input" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/"; }

cwd="$(get cwd)"; [ -z "$cwd" ] && cwd="$PWD"
root="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)"; [ -z "$root" ] && root="$cwd"
ledger="$root/.ledger"

[ -d "$ledger" ] || exit 0          # per-repo opt-out

# Loop guard: if we already blocked on the previous stop, allow the stop now.
if [ -f "$ledger/.flushing" ]; then
  rm -f "$ledger/.flushing" 2>/dev/null
  exit 0
fi

# Only act when there is pending unrouted work.
if [ -s "$ledger/.pending" ]; then
  touch "$ledger/.flushing" 2>/dev/null
  refs="$PLUGIN_ROOT/skills/archivist/references"
  pend="$(tr '\n' ' ' < "$ledger/.pending" 2>/dev/null)"
  esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
  msg="Before ending the turn: dispatch the archivist agent (LEDGER_REFS: $refs) to record these Ledger-worthy docs into the Ledger and update state/changelog, then delete .ledger/.pending. Docs: $pend"
  m="$(esc "$msg")"
  printf '{"decision":"block","continue":true,"reason":"Archivist: pending docs to persist into the Ledger","hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"%s"}}\n' "$m"
  exit 0
fi

exit 0
