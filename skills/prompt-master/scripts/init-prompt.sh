#!/bin/bash

# init-prompt.sh - Resolve target file path for a prompt-master output
#
# Usage: ./init-prompt.sh "topic or slug"
#        ./init-prompt.sh --project-dir /override/path "topic or slug"
#
# Walks up from CWD looking for project markers (.csproj, package.json,
# go.mod, etc.), stopping at the git root. Ensures
# {project-root}/docs/prompts/ exists. Prints the target file path of the
# form:
#
#   {project-root}/docs/prompts/pm_{YYYYMMDD-HHMMSS}_{slug}.md
#
# {project-root} is the nearest enclosing project (matched by language
# markers like *.csproj, package.json, go.mod, pyproject.toml, etc.). If
# no project marker is found between CWD and the git root, the git root
# is used. This means a prompt fired from inside a sub-project lands in
# that project's docs/prompts/, and a prompt fired from a repo without
# nested projects lands in the repo-level docs/prompts/.
#
# Does NOT write the file. The agent uses the printed path with the Write
# tool to create the actual prompt file.
#
# Self-contained: vendors the project-root resolution logic so prompt-master
# carries no dependency on the core plugin.

set -e

# Parse --project-dir override
PROJECT_DIR=""
ARGS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --project-dir) PROJECT_DIR="$2"; shift 2 ;;
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
        for pattern in "*.csproj" "*.fsproj" "*.vbproj"; do
            if compgen -G "$current/$pattern" > /dev/null 2>&1; then
                echo "$current"
                return 0
            fi
        done

        for marker in package.json go.mod Cargo.toml pyproject.toml pom.xml build.gradle build.gradle.kts; do
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

if [[ -n "$PROJECT_DIR" ]]; then
    PROJECT_ROOT="$PROJECT_DIR"
else
    PROJECT_ROOT="$(resolve_project_root)"
fi

PROMPTS_DIR="${PROJECT_ROOT}/docs/prompts"
mkdir -p "$PROMPTS_DIR"

timestamp=$(date +%Y%m%d-%H%M%S)
target_path="${PROMPTS_DIR}/pm_${timestamp}_${slug}.md"

# Friendly stderr note
if [[ -t 2 ]]; then
    printf '\033[0;32mPrompt target ready: %s\033[0m\n' "$target_path" >&2
else
    echo "Prompt target ready: $target_path" >&2
fi

# Target path to stdout (the script's return value)
echo "$target_path"
