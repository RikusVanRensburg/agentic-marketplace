---
name: librarian
description: Migrate repo docs into GitHub issues that keep their original date — backdated created_at, created closed, linked to the introducing commit, full content inline. Use when the user wants to archive or move documentation into issues while preserving historical dates, mentions backdating issue created_at or the GitHub Issue Import API, or wants to re-run such a migration idempotently.
---

The **librarian** shelves documentation into GitHub issues that carry the doc's **original**
creation date. Each issue is **backdated** (`created_at` = when the doc entered git), **created
already closed**
(archival — no triage, no notifications), **linked to the introducing commit**, and embeds the
doc's **full content inline**. The source files are deleted afterward, so the issue *is the
archive of record* — never a link to a file that will not exist.

The one hard constraint: `gh issue create` (what `to-issues` uses) **always stamps `created_at` =
now** and cannot backdate. Backdating requires the golden-comet **Issue Import API** — see
[references/issue-import-api.md](references/issue-import-api.md), wrapped by
`scripts/gh-import.sh`. Everything else — the sub-issue tree, the create→link→verify discipline,
the taxonomy-label rules — is **reused unchanged** from
[../../docs/github-operations.md](../../docs/github-operations.md); this skill swaps only the
*create* step for a backdated import.

**Standing rules.**

- Every issue embeds a hidden **marker** as its first body line — `<!-- doc-id: <path> -->` for a
  file, `<!-- doc-group: <folder> -->` for a parent. The marker is the idempotency key: a re-run
  scans for it and skips what exists, so the migration is safe to re-run and to resume after an
  interruption.
- The tree is **folder → parent, file → sub-issue**; root-level files stand alone. A parent is a
  synthetic closed backdated container whose body is an index of its children — unless the folder
  has a real index/README doc, which becomes the parent instead.
- An import that returns non-2xx, `failed`, or 404 is a **hard error**: surface it and stop.
  Falling back to `gh issue create` would create a non-backdated issue and silently defeat the
  skill.

## Steps

### 1. Preflight

`gh auth status` (authenticated, `repo` scope). Resolve the target repo from the clone. Confirm
**every taxonomy label** the run will apply (`scope:`, `state:`, any `type:` override) already
exists (`gh label list`). **Done when** auth is confirmed, the repo is known, and every label to
be applied is present. If a label is missing, surface it and stop — the `type:`/`scope:`/`state:`
taxonomy is pre-seeded team vocabulary this skill never creates.

### 2. Gather the run

Collect, asking the user for anything not supplied: the **paths/folders** to migrate; the
**anchor** (`first-add`, default, or `latest`); an optional **override mapping** (§4); the
**scope** label (default `scope: rr`) and **state** label (default `state: needs-triage`);
whether to **delete after** (leave off until the real run is approved). Expand the paths into a
node list — each folder a **parent**, each file within it a **child**, each root-level file a
**standalone**. **Done when** every node is listed and tagged parent | child-of-X | standalone
with its resolved labels.

### 3. Build the marker map — once

Page **all** issues, open and closed, and scan each body for the two markers:

```bash
gh api --paginate "repos/{owner}/{repo}/issues?state=all&per_page=100" \
  --jq '.[] | select(.body != null) | {number, body} | select(.body | test("<!-- doc-(id|group):"))'
```

Build a path/folder → issue-number map from the matches. This list-and-scan is the **source of
truth** for existence (issue search indexes HTML-comment text unreliably — use it at most as a
fast pre-check). **Done when** the map holds every already-migrated marker, built in this single
pass — never re-listed per doc.

### 4. Resolve dates and render the dry-run plan — writes nothing

Per file node, resolve commit + date:

```bash
git log --diff-filter=A --follow --format='%H %aI' -- "<path>" | tail -1   # first-add (default)
git log -1 --format='%H %aI' -- "<path>"                                   # latest (if --anchor latest)
```

An override-mapping entry (`{"doc","commit","date"}`) **wins** over git log for that doc. A file
neither in git nor overridden has no date to anchor — mark it **skip** and report it. A parent
inherits the **earliest** date/commit among its children. Normalize all times to UTC ISO-8601.

Render the plan as a table — per node: parent/child/standalone, exists? (from the map), date,
SHA, labels, action (import | skip-existing | skip-not-in-git). Present it and get an explicit
go-ahead. **Done when** the user has approved the plan and that approval predates the first import.

### 5. Migrate — parents before children, one node fully before the next

In dependency order (parents first, so each child link references a real parent number). Per node:

1. If its marker is in the map → **skip**, report "already migrated" (optionally repair a missing
   sub-issue link), move on.
2. Else build the body from [references/body-template.md](references/body-template.md), assemble
   the payload JSON (`title`, `body`, `created_at`/`updated_at`/`closed_at` = the resolved date,
   `closed: true`, `labels`), and import it:
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/skills/librarian/scripts/gh-import.sh" payload.json
   ```
   which prints the new issue number (or hard-fails).
3. If it is a child, **link and verify** it as a sub-issue of its parent using the exact
   "Create → link → verify" block from [../../docs/github-operations.md](../../docs/github-operations.md)
   (the sub-issue attach needs the child's integer `id`, not its number), and append the number
   to `CREATED`.

**Done when** every planned node is either skipped-existing or imported-and-verified. Any import,
link, or verify failure stops the run and surfaces the error — no silent continue, no `Parent:`
line fallback.

### 6. Closing set difference

The tree here mixes children with top-level nodes (parents and standalones), so the single-parent
`comm -23` from `github-operations.md` does not apply verbatim. Two checks:

- **Children** — the union of every parent's actual `sub_issues` list equals the planned set of
  children **exactly** (a set difference each way: nothing missing, nothing extra).
- **Top-level** — every parent and standalone reports **no parent**
  (`gh api .../issues/<n>/parent` 404s).

**Done when** both hold. Any missing/extra child link, or a top-level node with a parent, stops
the run — name it and fix before continuing.

### 7. Verification gate — an independent subagent

Removal is destructive, so an independent check stands in front of it:
`rr-workshop:defending-findings` applies — the creator does not grade its own work; each issue is
**guilty until proven innocent**. Dispatch a verification subagent — one per parent subtree plus
one for the standalones, in parallel when there are many
(`superpowers:dispatching-parallel-agents`). The prompt is **self-contained**: it carries the
plan (node → number, date, SHA, labels, parent) and inlines every `gh`/`git` command, because a
subagent cannot resolve plugin-internal paths. It checks each issue against **live GitHub**, not
against this run's logs:

- `created_at` equals the backdated date (emphatically not ~now); `state` closed, `closed_at` set.
- Body carries the marker and the **full source** — diff the content region (between the marker
  and the `---` footer) against the **current file** being archived; require a match. The footer
  cites the correct first-add SHA + date — that SHA is *provenance*, not the content source, so
  do not diff against `git show <sha>:<path>` (the file may have changed since it was introduced).
  Labels exact.
- A child is attached to the **correct parent** (`gh api .../issues/<n>/parent`); a standalone has
  none; a parent's `sub_issues` list equals **exactly** its planned children.

It returns per-node **PASS/FAIL with evidence**. **Done when** every node is PASS. Any FAIL →
surface the verdict and stop; remove nothing.

### 8. Removal — only if delete-after and the gate returned all-PASS

`git rm` the migrated files and commit on the **current branch** (whatever it is — a finished
feature branch, or main):

```
docs: archive to backdated issues (#N, #M, ...)
```

listing every created number. **Done when** the files are gone and the commit references every
created issue. The commit is the record; leave any merge/PR to the user.

### 9. Report

created / skipped / failed, each with its issue URL; remove the `CREATED` file.

## Red flags — STOP

- `gh issue create` (or `gh api POST .../issues`) forming instead of the Import API — that stamps
  *now* and defeats the skill; use `gh-import.sh`.
- An import that failed or 404'd, and a non-backdated create forming as a "fallback".
- Any file `git rm`'d before the verification subagent returned all-PASS.
- Re-listing issues per doc instead of the one marker map from step 3.
- A file issue that links to its source file instead of embedding the content, or a parent index
  pasted with doc content.
- A missing `type:`/`scope:`/`state:` label being created — surface it and stop instead.

## Done when

- [ ] Every migrated issue's `created_at` is the doc's historical date, and it is closed.
- [ ] Every issue embeds its marker and (file issues) the full source content plus the commit footer.
- [ ] The tree matches the plan — children under the right parent, standalones parentless — and
      the closing set difference printed nothing.
- [ ] The verification subagent returned all-PASS before any file was removed.
- [ ] Removal (if requested) committed on the current branch, listing every created issue number.
- [ ] A re-run creates nothing — every node reports "already migrated".
