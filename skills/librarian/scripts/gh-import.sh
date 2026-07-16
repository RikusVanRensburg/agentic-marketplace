#!/usr/bin/env bash
# Import ONE issue via GitHub's golden-comet Issue Import API, so created_at / closed_at can be
# set to the past. Reads a payload JSON (shape in references/issue-import-api.md), polls the
# async status URL with exponential backoff, and on success prints the new issue NUMBER to
# stdout. On failed / non-2xx / missing endpoint it prints the response to stderr and exits
# non-zero -- a hard fail, never a fallback to a live `gh issue create` (which would not backdate).
#
# Usage: gh-import.sh <payload.json>
# Repo is the current clone (gh fills the {owner}/{repo} placeholders); set GH_REPO to override.
set -euo pipefail

PAYLOAD="${1:?usage: gh-import.sh <payload.json>}"
ACCEPT="Accept: application/vnd.github.golden-comet-preview+json"
API="repos/{owner}/{repo}/import/issues"

# Extract the first string value for a key from flat JSON, without a jq dependency.
json_str() { grep -oE "\"$1\":\"[^\"]+\"" | head -1 | sed "s/.*\"$1\":\"//; s/\"$//"; }

post_resp=$(gh api --method POST -H "$ACCEPT" "$API" --input "$PAYLOAD") || {
  echo "gh-import: POST $API failed (preview endpoint may be gone)" >&2
  echo "$post_resp" >&2
  exit 1
}

status_url=$(printf '%s' "$post_resp" | json_str url)
if [ -z "$status_url" ]; then
  echo "gh-import: no status url in import response:" >&2
  echo "$post_resp" >&2
  exit 1
fi

delay=1
status=""
for _ in $(seq 1 12); do
  poll=$(gh api -H "$ACCEPT" "$status_url") || {
    echo "gh-import: status poll failed:" >&2; echo "$poll" >&2; exit 1; }
  status=$(printf '%s' "$poll" | json_str status)
  case "$status" in
    imported)
      num=$(printf '%s' "$poll" | json_str issue_url | grep -oE '[0-9]+$')
      [ -n "$num" ] || { echo "gh-import: imported but no issue number:" >&2; echo "$poll" >&2; exit 1; }
      printf '%s\n' "$num"
      exit 0
      ;;
    failed)
      echo "gh-import: import FAILED:" >&2; echo "$poll" >&2; exit 1 ;;
    pending|"")
      sleep "$delay"; delay=$(( delay < 8 ? delay * 2 : 8 )) ;;
    *)
      echo "gh-import: unexpected status '$status':" >&2; echo "$poll" >&2; exit 1 ;;
  esac
done

echo "gh-import: did not complete after retries (last status: ${status:-none})" >&2
exit 1
