# Body templates

The fixed bodies this skill imports. Two shapes: a **file issue** (a real migrated doc) and a
**parent index** (a synthetic folder container). Both carry a hidden **marker** as the first
line — the idempotency key the marker scan (SKILL.md step 3) matches on.

## Ground rules

- The marker is line one, an HTML comment, exact: `<!-- doc-id: <repo-relative-path> -->` for a
  file issue, `<!-- doc-group: <folder-path> -->` for a parent. The path is the doc's **current**
  path (after any rename `--follow` traversed); note prior paths in prose if useful.
- A file issue embeds the doc's **full content verbatim** — the source file is deleted after
  migration, so the issue is the archive of record. Never a link to the file in place of content.
- The migration footer names the introducing commit with its **full 40-char SHA** (auto-links
  within the repo, and keeps resolving after the file is gone) and the historical date.
- A parent index carries **no doc content** — folders have none. It states the archive context
  only; the child list is the native **sub-issue** links, not enumerated numbers in the body
  (enumerating them would force children-before-parent and hardcode brittle numbers).

<file-issue-template>
<!-- doc-id: {repo_relative_path} -->

{full original doc content, verbatim}

---
_Migrated from `{repo_relative_path}`. Originally documented in {full_sha} on {YYYY-MM-DD}._
</file-issue-template>

<parent-index-template>
<!-- doc-group: {folder_path} -->

Archive of the docs under `{folder_path}/`, migrated as backdated closed issues. Each document
is a linked **sub-issue** of this one.

---
_Folder archive. Earliest doc introduced in {full_sha} on {YYYY-MM-DD}._
</parent-index-template>
