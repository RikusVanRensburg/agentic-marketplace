# GitHub operations

Shared `gh` mechanics for the rr-workshop skills (wayfinder, to-spec, to-issues).

> **Scope note:** main-session skills read this file directly. Anything that goes into a
> subagent or workflow prompt must be **inlined at dispatch time** — subagents cannot resolve
> plugin-internal paths.

All commands assume a clone: `gh issue` infers the repo from `git remote -v`. In `gh api`
paths, use the **literal `{owner}/{repo}` placeholders** — `gh api` auto-fills them from the
clone; a bare `OWNER/REPO` would 404 (unlike `gh issue`, `gh api` does not resolve names).

## Everyday operations

- **Create**: `gh issue create --title "..." --body "..."` — or `--body-file <path>` to publish
  a local draft. Use a heredoc for multi-line inline bodies.
- **Labels**: a **separate `--label` flag each** (`--label "wayfinder:research" --label "scope: rr"`),
  never one comma-joined string — that is fragile around comma spacing and labels containing
  commas. `could not add label: not found` means the label is missing or the whitespace doesn't
  match (one space after the colon in the repo's `type:`/`scope:`/`state:` taxonomy; none in
  `wayfinder:*`).
- **Read**: `gh issue view <n> --comments` renders body + comments as markdown. To filter
  programmatically use the JSON form — `gh issue view <n> --json title,body,labels,comments,assignees,state --jq '...'`
  — because `--comments` emits markdown, not JSON, so it can't be piped to `jq`.
- **List**: `gh issue list --state open --label "..." --json number,title,labels,assignees`
- **Comment**: `gh issue comment <n> --body "..."`
- **Edit labels**: `gh issue edit <n> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <n> --reason completed --comment "..."` — `--reason` accepts only
  `completed` or `not planned`.

## Claiming — the assignee is the claim

```bash
gh issue edit <n> --add-assignee @me
```

Run it **before any work** on the issue. An open issue with an empty `assignees` array is
unclaimed; check via `gh issue view <n> --json assignees --jq '.assignees | length'`.

## Label create-if-missing

For plugin-owned label namespaces (e.g. wayfinder's five `wayfinder:*` labels), ensure each
exists before first use:

```bash
EXISTING=$(gh label list --limit 200 --json name --jq '.[].name')
for L in "wayfinder:map" "wayfinder:research" "wayfinder:prototype" "wayfinder:grilling" "wayfinder:task"; do
  echo "$EXISTING" | grep -qxF "$L" || gh label create "$L" --color "1D76DB" --description "rr-workshop wayfinder"
done
```

If `gh label create` is denied (no label permission in the repo), surface the error and fall
back per the calling skill's degraded mode — do not retry silently. The repo's shared
`type:`/`scope:`/`state:` taxonomy is different: those labels are pre-seeded team vocabulary
and are never created by a skill.

## Sub-issues (parent/child tree)

The parent/child relationship is native GitHub, set via REST.

- **Attach a child to a parent** — needs the child's **integer `id`**, NOT its issue number
  (the most common footgun):

  ```bash
  CHILD_ID=$(gh api repos/{owner}/{repo}/issues/<CHILD_NUMBER> --jq '.id')
  gh api -X POST repos/{owner}/{repo}/issues/<PARENT_NUMBER>/sub_issues -F sub_issue_id="$CHILD_ID"
  ```

- **List a parent's children** — always `--paginate`; a parent can exceed one page (30), and a
  single un-paginated page would falsely report later children as missing:

  ```bash
  gh api --paginate repos/{owner}/{repo}/issues/<PARENT_NUMBER>/sub_issues --jq '.[].number'
  ```

- **Find an issue's parent** — the `parent` sub-resource; `gh issue view --json` does NOT
  expose it:

  ```bash
  gh api repos/{owner}/{repo}/issues/<N>/parent --jq '.number'   # empty / fails ⇒ N is a root
  ```

GitHub caps sub-issues at 100 per parent and 8 levels of nesting. Sub-issuing is **additive**:
it does not change the parent's state or body, and closing all children never auto-closes the
parent.

## Create → link → verify (per child, in order)

When creating a batch of children under a parent, run all three steps per child before moving
to the next:

```bash
# a. Create — capture the new issue's NUMBER (gh issue create prints the URL; the number is
#    the trailing path segment):
CHILD_NUMBER=$(gh issue create --title "..." --body-file <body>.md \
  --label "<label>" | grep -oE '[0-9]+$')
echo "$CHILD_NUMBER" >> CREATED          # accumulate for the closing verification below

# b. Link — fetch the internal integer id (sub_issues needs the id, NOT the number):
CHILD_ID=$(gh api repos/{owner}/{repo}/issues/"$CHILD_NUMBER" --jq '.id')
gh api -X POST repos/{owner}/{repo}/issues/PARENT_NUMBER/sub_issues -F sub_issue_id="$CHILD_ID"

# c. Verify the link before moving on:
gh api --paginate repos/{owner}/{repo}/issues/PARENT_NUMBER/sub_issues --jq '.[].number' \
  | grep -qx "$CHILD_NUMBER" && echo "linked $CHILD_NUMBER" \
  || { echo "LINK MISSING for $CHILD_NUMBER"; exit 1; }
```

The `|| { …; exit 1; }` matters: `grep -qx … && echo … || echo …` on its own always exits 0,
so a missing link would slip past a shell that checks the exit code.

**If create, link, or verify fails, STOP and surface the error.** Do not continue to the next
child, and do not silently fall back to a markdown "Parent:" line in the body.

## Closing verification (set difference)

After a batch, assert every created child is linked under the parent — a set difference, not a
glance:

```bash
comm -23 <(sort -u CREATED) \
  <(gh api --paginate repos/{owner}/{repo}/issues/PARENT_NUMBER/sub_issues --jq '.[].number' | sort -u)
```

This prints any created child **not** linked under the parent. Require **empty output**, then
report "**N created, N verified** as sub-issues of #PARENT_NUMBER" and remove the `CREATED`
file. If it prints numbers, those links are missing — name them and stop; do not declare
success.

## Frontier query

The frontier is the **open, unblocked, unclaimed** children of a parent (wayfinder's map).
Two passes:

```bash
# 1. Candidates: open, unclaimed children
gh api --paginate repos/{owner}/{repo}/issues/<MAP_NUMBER>/sub_issues \
  --jq '.[] | select(.state == "open" and (.assignees | length) == 0) | "\(.number)\t\(.title)"'

# 2. Per candidate: read its "## Blocked by" section, then check every referenced blocker
gh issue view <CANDIDATE> --json body --jq '.body'    # extract the #N references under "## Blocked by"
gh issue view <BLOCKER> --json state --jq '.state'    # every blocker "CLOSED" ⇒ candidate is on the frontier
```

A candidate whose `## Blocked by` says "None — can start immediately" is on the frontier
without pass 2.

## Native issue dependencies (optional visual layer)

GitHub also has native issue dependencies ("blocked by" relationships rendered in the issue
UI), reachable via `gh api`. **No skill behavior depends on them** — the `## Blocked by` body
section is the guaranteed channel. A later authoring pass may probe the REST endpoints in a
sandbox and record working commands here; until then treat native dependencies as an
additional visual layer only.
