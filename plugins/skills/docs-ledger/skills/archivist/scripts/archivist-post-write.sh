#!/usr/bin/env bash
# docs-ledger:archivist ambient hook — PostToolUse (Write|Edit)
# Per-repo opt-in: acts only if a .ledger/ exists at the repo root.
# Fires when a Ledger-worthy doc is written:
#   - ACTIVE mode  (.ledger/.session-active present): instruct an immediate archivist run.
#   - AMBIENT mode (default): queue the path in .ledger/.pending and flag lightly;
#     it gets routed at turn end by the Stop hook.
# Ignores the archivist's own writes (anything under .ledger/) to avoid loops.

PLUGIN_ROOT="${1:-${CLAUDE_PLUGIN_ROOT:-}}"
input="$(cat)"

get() { printf '%s' "$input" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/"; }

cwd="$(get cwd)"; [ -z "$cwd" ] && cwd="$PWD"
fp="$(get file_path)"
root="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)"; [ -z "$root" ] && root="$cwd"
ledger="$root/.ledger"

[ -d "$ledger" ] || exit 0          # per-repo opt-out
[ -n "$fp" ] || exit 0

case "$fp" in
  "$ledger"/*) exit 0 ;;            # our own ledger writes — ignore
esac

# Ledger-worthy heuristic: a markdown doc that is not a README.
base="$(basename "$fp")"
case "$base" in
  *.md|*.mdx) ;;
  *) exit 0 ;;
esac
case "$base" in
  README.md|README.mdx) exit 0 ;;
esac

refs="$PLUGIN_ROOT/skills/archivist/references"
esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

if [ -f "$ledger/.session-active" ]; then
  msg="ACTIVE Archivist mode: a Ledger-worthy doc was just written ($fp). Immediately dispatch the archivist agent (LEDGER_REFS: $refs) to ingest/record it into the Ledger, then continue. Relay only its concise summary."
else
  printf '%s\n' "$fp" >> "$ledger/.pending" 2>/dev/null
  msg="Noted a Ledger-worthy doc ($fp); flagged for the Archivist and routed at turn end. No action needed now unless it records a decision — if so, record it via the archivist agent (LEDGER_REFS: $refs)."
fi

m="$(esc "$msg")"
printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' "$m"
exit 0
