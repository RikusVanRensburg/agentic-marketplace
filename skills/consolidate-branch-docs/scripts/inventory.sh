#!/usr/bin/env bash
# Branch-life doc inventory with log + diff cross-check.
#
# Usage:
#   inventory.sh                  # auto-detect base (dev > main > master), inventory *.md
#   inventory.sh <base>           # explicit base branch
#   inventory.sh <base> <glob>    # explicit base + glob (e.g. '*.md' or '*.{md,txt,adoc}')
#
# Outputs four sections: ADDED on branch, MODIFIED on branch, DELETED on branch,
# ADDED on base since branch cut (merge-conflict surface).
#
# Cross-checks `git log --diff-filter=A` (the natural "what did this branch add"
# view) against `git diff --diff-filter=A $(merge-base)..HEAD` (robust against
# rebases / base-merges). If counts disagree, prefers the diff form and flags
# the discrepancy.

set -euo pipefail

# --- Resolve base branch ---
if [[ $# -ge 1 && -n "$1" ]]; then
  BASE="$1"
else
  for candidate in dev main master; do
    if git show-ref --verify --quiet "refs/heads/$candidate"; then
      BASE="$candidate"
      break
    fi
  done
  if [[ -z "${BASE:-}" ]]; then
    echo "ERROR: could not auto-detect base branch (no dev/main/master found). Pass explicitly: inventory.sh <base>" >&2
    exit 1
  fi
fi

GLOB="${2:-*.md}"

if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "ERROR: base branch '$BASE' not found" >&2
  exit 1
fi

MERGE_BASE=$(git merge-base "$BASE" HEAD)
HEAD_REV=$(git rev-parse HEAD)
BASE_REV=$(git rev-parse "$BASE")

echo "Branch: $(git branch --show-current 2>/dev/null || echo '(detached)')"
echo "Base:        $BASE ($BASE_REV)"
echo "HEAD:        $HEAD_REV"
echo "Merge base:  $MERGE_BASE"
echo "Glob:        $GLOB"
echo ""

# --- Cross-check log form vs diff form for ADDED ---
LOG_ADDED=$(git log "$BASE..HEAD" --diff-filter=A --name-only --format= -- "$GLOB" 2>/dev/null | grep -v '^$' | sort -u || true)
DIFF_ADDED=$(git diff --diff-filter=A --name-only "$MERGE_BASE..HEAD" -- "$GLOB" 2>/dev/null | sort -u || true)

LOG_COUNT=$(printf '%s\n' "$LOG_ADDED" | grep -c . || true)
DIFF_COUNT=$(printf '%s\n' "$DIFF_ADDED" | grep -c . || true)

if [[ "$LOG_COUNT" != "$DIFF_COUNT" ]]; then
  echo "WARNING: log form ($LOG_COUNT added) and diff form ($DIFF_COUNT added) disagree."
  echo "         The branch was likely rebased or had $BASE merged in. Using the diff form as authoritative."
  echo ""
fi

echo "=== ADDED on branch ($DIFF_COUNT) ==="
printf '%s\n' "$DIFF_ADDED"
echo ""

# --- MODIFIED (pre-existed on base, touched on branch) ---
DIFF_MODIFIED=$(git diff --diff-filter=M --name-only "$MERGE_BASE..HEAD" -- "$GLOB" 2>/dev/null | sort -u || true)
MOD_COUNT=$(printf '%s\n' "$DIFF_MODIFIED" | grep -c . || true)
echo "=== MODIFIED on branch ($MOD_COUNT) — pre-existed on $BASE ==="
printf '%s\n' "$DIFF_MODIFIED"
echo ""

# --- DELETED on branch ---
DIFF_DELETED=$(git diff --diff-filter=D --name-only "$MERGE_BASE..HEAD" -- "$GLOB" 2>/dev/null | sort -u || true)
DEL_COUNT=$(printf '%s\n' "$DIFF_DELETED" | grep -c . || true)
echo "=== DELETED on branch ($DEL_COUNT) ==="
printf '%s\n' "$DIFF_DELETED"
echo ""

# --- ADDED on base since branch cut (merge-conflict surface) ---
BASE_NEW=$(git diff --diff-filter=A --name-only "$MERGE_BASE..$BASE" -- "$GLOB" 2>/dev/null | sort -u || true)
BASE_NEW_COUNT=$(printf '%s\n' "$BASE_NEW" | grep -c . || true)
echo "=== ADDED on $BASE since branch cut ($BASE_NEW_COUNT) — possible conflict surface ==="
printf '%s\n' "$BASE_NEW"
