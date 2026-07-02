#!/bin/bash

# init-workshop.sh - Bootstrap a workshop run (one-loop, .ledger-based)
#
# Usage: ./init-workshop.sh "<task>" [--scope PATH] [--dry-run]
#        ./init-workshop.sh --resume "<task>" [--scope PATH]
#
# Resolves scope by walking up from CWD for project markers, bounded by git root.
# Creates <scope>/.ledger/<slug>/{grill,specs,plans,review}/ and writes state.json.
# Verifies all required external skills are installed.
#
# Returns (stdout):  <scope>|<slug>|<ledger-dir>|<state-json-path>
#
# This script NEVER reads or modifies .gitignore. The user owns that file.

set -e

TASK=""
SCOPE_OVERRIDE=""
DRY_RUN=0
RESUME=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --scope) SCOPE_OVERRIDE="$2"; shift 2 ;;
        --dry-run) DRY_RUN=1; shift ;;
        --resume) RESUME=1; shift ;;
        *) if [[ -z "$TASK" ]]; then TASK="$1"; fi; shift ;;
    esac
done

if [[ -z "$TASK" ]]; then
    echo "Error: task argument required" >&2
    echo "Usage: $0 \"<task>\" [--scope PATH] [--dry-run]" >&2
    echo "       $0 --resume \"<task>\" [--scope PATH]" >&2
    exit 1
fi

generate_slug() {
    echo "$1" | head -c 50 | tr '[:upper:]' '[:lower:]' \
        | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' \
        | sed 's/^-//' | sed 's/-$//'
}
SLUG=$(generate_slug "$TASK")
if [[ -z "$SLUG" ]]; then
    echo "Error: slug empty after sanitization" >&2
    exit 1
fi

resolve_scope() {
    local start_dir git_root current parent pattern marker
    start_dir="$(pwd)"
    git_root=$(git -C "$start_dir" rev-parse --show-toplevel 2>/dev/null || echo "$start_dir")
    current="$start_dir"
    while true; do
        for pattern in "*.csproj" "*.fsproj" "*.vbproj" "*.sln"; do
            if compgen -G "$current/$pattern" > /dev/null 2>&1; then echo "$current"; return 0; fi
        done
        for marker in package.json pnpm-workspace.yaml turbo.json lerna.json nx.json \
                      go.mod Cargo.toml Cargo.workspace.toml pyproject.toml setup.py requirements.txt \
                      pom.xml build.gradle build.gradle.kts Directory.Build.props; do
            if [[ -f "$current/$marker" ]]; then echo "$current"; return 0; fi
        done
        if [[ "$current" == "$git_root" ]]; then break; fi
        parent="$(dirname "$current")"
        if [[ "$parent" == "$current" ]]; then break; fi
        current="$parent"
    done
    echo "$git_root"
}

if [[ -n "$SCOPE_OVERRIDE" ]]; then
    # S4 — validate an explicit --scope: must be an existing directory inside a git repo.
    if [[ ! -d "$SCOPE_OVERRIDE" ]]; then
        echo "Error: --scope path does not exist or is not a directory: $SCOPE_OVERRIDE" >&2
        exit 1
    fi
    if ! git -C "$SCOPE_OVERRIDE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        echo "Error: --scope is not inside a git repository: $SCOPE_OVERRIDE" >&2
        exit 1
    fi
    SCOPE="$SCOPE_OVERRIDE"
else
    SCOPE="$(resolve_scope)"
fi

LEDGER_DIR="$SCOPE/.ledger/$SLUG"
STATE_JSON="$LEDGER_DIR/state.json"

# ---------- Resume path ----------
if [[ "$RESUME" -eq 1 ]]; then
    if [[ ! -f "$STATE_JSON" ]]; then
        echo "Error: no existing state.json for resume at $STATE_JSON" >&2
        exit 1
    fi
    CURRENT=$(grep -o '"current_stage"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATE_JSON" | sed 's/.*"\([^"]*\)"$/\1/')
    echo "Resuming '$SLUG' at stage: ${CURRENT:-unknown}" >&2
    echo "$SCOPE|$SLUG|$LEDGER_DIR|$STATE_JSON"
    exit 0
fi

# ---------- Verify externals ----------
PLUGIN_CACHE="${CLAUDE_PLUGIN_CACHE:-$HOME/.claude/plugins/cache}"
verify_skill() {
    local plugin="$1" skill="$2"
    if compgen -G "$PLUGIN_CACHE/*/$plugin/*/skills/$skill/SKILL.md" > /dev/null 2>&1 \
       || compgen -G "$PLUGIN_CACHE/*/$plugin/skills/$skill/SKILL.md" > /dev/null 2>&1; then
        return 0
    fi
    echo "  ✗ skill $plugin:$skill not found in $PLUGIN_CACHE" >&2
    return 1
}
MISSING=0
verify_skill "superpowers" "brainstorming"               || MISSING=1
verify_skill "rr"          "grill"                        || MISSING=1
verify_skill "rr"          "defending-findings"           || MISSING=1
verify_skill "superpowers" "writing-plans"               || MISSING=1
verify_skill "superpowers" "subagent-driven-development"  || MISSING=1
verify_skill "superpowers" "verification-before-completion" || MISSING=1
verify_skill "superpowers" "requesting-code-review"       || MISSING=1
if [[ "$MISSING" -ne 0 ]]; then
    echo "Error: required externals missing — install before running the workshop." >&2
    exit 2
fi

# ---------- Dry run ----------
if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "Dry-run — would create: $LEDGER_DIR/{grill,specs,plans,review} and write $STATE_JSON" >&2
    echo "$SCOPE|$SLUG|$LEDGER_DIR|$STATE_JSON"
    exit 0
fi

# ---------- Create folders + state.json ----------
mkdir -p "$LEDGER_DIR/grill" "$LEDGER_DIR/specs" "$LEDGER_DIR/plans" "$LEDGER_DIR/review"

CREATED=$(date -u +%FT%TZ 2>/dev/null || echo "unknown")
TASK_ESCAPED=$(echo "$TASK" | sed 's/\\/\\\\/g; s/"/\\"/g')

if [[ ! -f "$STATE_JSON" ]]; then
cat > "$STATE_JSON" <<EOF
{
  "slug": "$SLUG",
  "task": "$TASK_ESCAPED",
  "scope": "$SCOPE",
  "created": "$CREATED",
  "current_stage": "design",
  "completed_stages": [],
  "artifacts": { "context": null, "spec": null, "plan": null, "review": null },
  "commits": [],
  "tasks": [],
  "tasks_done": [],
  "status": "running",
  "workflow_run_id": null
}
EOF
fi

if [[ -t 2 ]]; then
    printf '\033[0;32mWorkshop initialized:\033[0m\n' >&2
    printf '  Scope:  %s\n' "$SCOPE" >&2
    printf '  Slug:   %s\n' "$SLUG" >&2
    printf '  Ledger: %s\n' "$LEDGER_DIR" >&2
else
    echo "Workshop initialized at $LEDGER_DIR" >&2
fi

echo "$SCOPE|$SLUG|$LEDGER_DIR|$STATE_JSON"
