#!/bin/bash

# init-grill.sh - Resolve target folder path for a grill session
#
# Usage: ./init-grill.sh "topic or slug"
#        ./init-grill.sh --dry-run "topic or slug"
#        ./init-grill.sh --project-dir /override/path "topic or slug"
#
# Walks up from CWD looking for project markers (.csproj, package.json,
# go.mod, etc.), stopping at the git root. Ensures
# {project-root}/docs/grilled/{slug}/ exists (unless --dry-run is set).
# Prints the topic-folder absolute path of the form:
#
#   {project-root}/docs/grilled/{slug}/
#
# {project-root} is the nearest enclosing project (matched by language
# markers like *.csproj, package.json, go.mod, pyproject.toml, etc.). If
# no project marker is found between CWD and the git root, the git root
# is used. This means a grill fired from inside a sub-project lands in
# that project's docs/grilled/, and a grill fired from a repo without
# nested projects lands in the repo-level docs/grilled/.
#
# Does NOT create the adr/ subfolder — the skill creates it lazily on
# first ADR write.
#
# Does NOT write any content files. The skill uses the printed path with
# the Write tool to create CONTEXT.md and any ADRs.
#
# Self-contained: vendors the project-root resolution logic so grill
# carries no dependency on the core plugin.

set -e

# Parse flags: --project-dir override, --docs-root override, --dry-run
PROJECT_DIR=""
DOCS_ROOT=""
DRY_RUN=0
ARGS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --project-dir) PROJECT_DIR="$2"; shift 2 ;;
        --docs-root) DOCS_ROOT="$2"; shift 2 ;;
        --dry-run) DRY_RUN=1; shift ;;
        *) ARGS+=("$1"); shift ;;
    esac
done
set -- "${ARGS[@]}"

if [[ $# -lt 1 ]]; then
    echo "Error: topic/slug argument required" >&2
    echo "Usage: $0 [--project-dir /path] \"topic or slug\"" >&2
    exit 1
fi

topic_raw="$*"

# Slug: first 50 chars, lowercase, non-alphanumeric -> dash, trim leading/trailing dashes
generate_slug() {
    echo "$1" | head -c 50 | tr '[:upper:]' '[:lower:]' \
        | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' \
        | sed 's/^-//' | sed 's/-$//'
}

slug=$(generate_slug "$topic_raw")

if [[ -z "$slug" ]]; then
    echo "Error: slug empty after sanitization" >&2
    exit 1
fi

# Walk up from CWD looking for project markers, bounded by git root
resolve_project_root() {
    local start_dir
    start_dir="$(pwd)"

    local git_root
    git_root=$(git -C "$start_dir" rev-parse --show-toplevel 2>/dev/null || echo "$start_dir")

    local current="$start_dir"
    while true; do
        # Keep this marker list in sync with init-workshop.sh's resolve_scope().
        for pattern in "*.csproj" "*.fsproj" "*.vbproj" "*.sln"; do
            if compgen -G "$current/$pattern" > /dev/null 2>&1; then
                echo "$current"
                return 0
            fi
        done

        for marker in package.json pnpm-workspace.yaml turbo.json lerna.json nx.json \
                      go.mod Cargo.toml Cargo.workspace.toml pyproject.toml setup.py requirements.txt \
                      pom.xml build.gradle build.gradle.kts Directory.Build.props; do
            if [[ -f "$current/$marker" ]]; then
                echo "$current"
                return 0
            fi
        done

        if [[ "$current" == "$git_root" ]]; then
            break
        fi

        local parent
        parent="$(dirname "$current")"
        if [[ "$parent" == "$current" ]]; then
            break
        fi
        current="$parent"
    done

    echo "$git_root"
}

# --docs-root, when given, IS the topic folder directly: it bypasses project-root
# resolution and the docs/grilled/<slug> layout. Used by rr:workshop to land grill
# output at <scope>/.ledger/<slug>/grill/. Default behavior is unchanged.
if [[ -n "$DOCS_ROOT" ]]; then
    TOPIC_DIR="$DOCS_ROOT"
else
    if [[ -n "$PROJECT_DIR" ]]; then
        PROJECT_ROOT="$PROJECT_DIR"
    else
        PROJECT_ROOT="$(resolve_project_root)"
    fi
    TOPIC_DIR="${PROJECT_ROOT}/docs/grilled/${slug}"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
    # Preview only — do not create the folder
    if [[ -t 2 ]]; then
        printf '\033[0;33mDry-run — would create: %s\033[0m\n' "$TOPIC_DIR" >&2
    else
        echo "Dry-run — would create: $TOPIC_DIR" >&2
    fi
else
    mkdir -p "$TOPIC_DIR"
    if [[ -t 2 ]]; then
        printf '\033[0;32mGrilling target ready: %s\033[0m\n' "$TOPIC_DIR" >&2
    else
        echo "Grilling target ready: $TOPIC_DIR" >&2
    fi
fi

# Topic-folder path to stdout (the script's return value)
echo "$TOPIC_DIR"
