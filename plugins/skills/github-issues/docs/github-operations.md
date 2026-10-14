# GitHub operations

Shared `gh` mechanics for this plugin's skills and agents.

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

## Native issue type

Separate from the `type:` label taxonomy, GitHub has a native per-org Issue Type field
(`Task`/`Bug`/`Feature`/`PRD` in this org — check with `gh api orgs/{owner}/issue-types` if
unsure). Set it with `gh issue create --type <name>` or `gh issue edit <n> --type <name>` /
`--remove-type`. It is **coarser** than the `type:` label and additive to it, never a
replacement:

| `type:` label | native `type` |
|---|---|
| `feat` | `Feature` |
| `fix` | `Bug` |
| `refactor` | `Task` |
| `chore` | `Task` |
| `docs` | `Task` |
| *(spec/PRD issues)* | `PRD` — unconditional, regardless of the spec's own `type:` label |

A slice or wayfinder ticket keeps its full-granularity `type:` label unchanged; only the
native field is coarse-mapped.

## Claiming — the assignee is the claim

```bash
gh issue edit <n> --add-assignee @me
```

Run it **before any work** on the issue. An open issue with an empty `assignees` array is
unclaimed; check via `gh issue view <n> --json assignees --jq '.assignees | length'`.

## Assignee on creation

Singleton parent issues with no claiming model — a wayfinder **map**, a to-spec **spec**, a
librarian archival issue — get `--assignee @me` (or the resolved login, for the Import API)
at creation: there is no frontier to break.

**`to-issues` slices and wayfinder tickets are the opposite** — both use "unassigned =
unclaimed" as their frontier signal (see "Claiming" above and "Frontier query" below).
Auto-assigning their creator at creation would make every one of them look claimed
immediately, permanently emptying the frontier. They stay unassigned at creation; assignment
only happens at claim time, via `gh issue edit <n> --add-assignee @me`.

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

**Prefer the `gh` CLI flags for the common case** — `gh issue create --parent <n>` (at
creation) or `gh issue edit <n> --parent <n>` / `gh issue edit <parent> --add-sub-issue <n>`
(after the fact) — one call, no manual `id` lookup. The raw REST mechanics below remain for
reference, and because the verify step (below, and in "Create → verify") always checks
`sub_issues` regardless of how the link was attached, verification doesn't change either way.
To check a child's parent from its own JSON, use the issue payload's `parent_issue_url` field
(or `gh issue view <n> --json parent`) — there is no `sub_issue_parent` key; a guessed key here
reads as a false negative on a link that's actually fine.

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

## Create → verify (per child, in order)

`gh issue create --parent <n>` attaches the sub-issue relationship in the same call as
creation — no separate lookup or POST needed. Still run both steps per child, fully, before
moving to the next:

```bash
# a. Create — --parent attaches the sub-issue relationship in the same call. Capture the new
#    issue's NUMBER (gh issue create prints the URL; the number is the trailing path segment):
CHILD_NUMBER=$(gh issue create --title "..." --body-file <body>.md \
  --label "<label>" --parent PARENT_NUMBER | grep -oE '[0-9]+$')
echo "$CHILD_NUMBER" >> CREATED          # accumulate for the closing verification below

# b. Verify the link before moving on — --parent can still fail to attach silently:
gh api --paginate repos/{owner}/{repo}/issues/PARENT_NUMBER/sub_issues --jq '.[].number' \
  | grep -qx "$CHILD_NUMBER" && echo "linked $CHILD_NUMBER" \
  || { echo "LINK MISSING for $CHILD_NUMBER"; exit 1; }
```

The `|| { …; exit 1; }` matters: `grep -qx … && echo … || echo …` on its own always exits 0,
so a missing link would slip past a shell that checks the exit code.

**If create or verify fails, STOP and surface the error.** Do not continue to the next
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

## Native blocking relationships

GitHub has native issue dependencies — "blocked by"/"blocking" relationships, distinct from
the parent/child sub-issue tree above. Confirmed live on this repo
(`issues/{n}/dependencies/blocked_by` and `.../blocking` respond, not 404) and set with one
flag each — this needs no manual REST dance, the CLI flags are first-class:

- **At creation**: `gh issue create --blocked-by <n1,n2> --blocking <n3,n4>` — all three
  mechanics (parent, type, blocking) can land in a single `gh issue create` call.
- **After the fact** (the usual case — a blocker rarely has a number yet when the blocked
  slice is created): `gh issue edit <n> --add-blocked-by <n> --add-blocking <n>` /
  `--remove-blocked-by <n>` / `--remove-blocking <n>`

If probing the raw REST endpoints directly instead of the CLI flags, note they take the
blocker's **numeric `id`**, not its issue number (`{"issue_id": <id>}`) — prefer the CLI flags
and skip that lookup entirely. Issues also carry an `issue_dependencies_summary` object
(`blocked_by`/`blocking` counts) usable as a cheap verification read.

**This is additive, not a replacement for the `## Blocked by` body section.** The native
relationship is the machine-checkable graph GitHub's UI and API render; the markdown prose is
the evidence and reasoning behind each edge that `defending-findings:defending-findings` requires —
neither channel can hold what the other carries. Every edge gets both.

## Milestones — attach-only

Milestones must **already exist** to attach one (`-m/--milestone` on `gh issue create` /
`gh issue edit` resolves by name and fails if it doesn't). No skill in this plugin creates a
milestone — an issue either attaches an existing one that already fits, or carries none.
A repo with zero milestones is a normal state to find, not a gap to fill.
