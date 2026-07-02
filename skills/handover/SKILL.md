---
name: handover
version: 1.1.0
description: Use when the user is about to end a Claude Code session and wants the current work compacted into a written handover document a fresh agent can pick up from cold — capturing in-progress work, decisions made with rationale, dead-ends explored, blockers, and concrete next steps. Triggers include "handover", "hand this over", "compact for next session", "write a handover", "/rr:handover", "make a handover doc", "the next session needs to know X".
argument-hint: "[--target <abs-path>] What will the next session focus on?"
---

# Handover

Compact the current session into a written handover document a fresh agent can act on cold. Three reviewer sub-agents peer-review the draft before it is saved.

## Not for

- In-session conversation compaction → use `/compact`.
- Per-feature specs before building → use `superpowers:brainstorming`.
- Implementation plans → use `superpowers:writing-plans`.
- Durable domain canon (glossary, ADRs) → use `rr:grill`.

## Hard rules — never violate

- **You are the writer.** Only you have full conversation context. Sub-agents draft *nothing*.
- **Always run the three reviewers.** No shortcut, no `--quick` mode. Peer review is the point.
- **Default location:** `<git-root>/docs/handovers/YYYY-MM-DD-HHMMSS-<slug>.md`. Callers MAY override with a leading `--target <abs-path>` token in `$ARGUMENTS` (used by orchestrators like `rr:workshop`); standalone use never saves elsewhere.
- **Never read or write `.gitignore`.** The user owns their gitignore policy. The skill makes no checks and emits no recommendations about it.
- **Never write secrets to the file.** The safety reviewer will catch leaks; redact before saving.
- **Reference artifacts by path/URL — do not duplicate them.** PRs, plans, ADRs, issues.
- **Use the `Bash` tool for git and file operations.** Works cross-platform (git-bash on Windows, native on macOS/Linux). Do NOT mix bash output into PowerShell commands.

## Flow

1. **Parse `$ARGUMENTS` and locate the output path.**
   - If `$ARGUMENTS` begins with the literal token `--target` followed by whitespace, treat the next whitespace-delimited token as `TARGET_PATH` (must be absolute). The remainder of `$ARGUMENTS` is the focus text. Set `OUT_DIR = dirname(TARGET_PATH)` and `OUT_FILE = TARGET_PATH`. Run via Bash tool: `mkdir -p "$OUT_DIR"`. Skip the git-root lookup for path purposes.
   - Otherwise (no `--target`): run via Bash tool: `git rev-parse --show-toplevel`. Save the output as `GIT_ROOT`. Set `OUT_DIR = $GIT_ROOT/docs/handovers/`. Ensure it exists; create with `mkdir -p` if missing. `OUT_FILE` is computed in step 6 from the focus-derived slug.
   - In both cases, still capture `GIT_ROOT` (it's needed for collecting git evidence in step 2).

2. **Collect git evidence** (you'll pass this to the coverage reviewer). Run via Bash tool:
   ```bash
   cd "$GIT_ROOT"
   git rev-parse --abbrev-ref HEAD                                 # current branch
   git log -1 --oneline                                            # last commit
   git status --porcelain                                          # working-tree changes
   git ls-files --modified --others --exclude-standard             # modified + untracked
   # determine base branch then run:
   git log --oneline <base>..HEAD                                  # commits this branch added
   git diff --stat <base>..HEAD                                    # file-level diff summary
   ```
   Save the combined output as `GIT_EVIDENCE`.

3. **Draft the document.** In memory only — do not write yet. Use the structure in `## Document structure` below. The user's `$ARGUMENTS` (text passed after the skill name) is the next-session focus.

4. **Dispatch the three reviewers in parallel** — single message, three Agent tool calls. Construct each dispatch prompt as follows:

   **handover-coverage-reviewer** — prompt MUST contain:
   - The line `Working directory: <GIT_ROOT>`
   - A fenced block labeled `# Git evidence` containing `GIT_EVIDENCE` verbatim
   - A fenced block labeled `# Draft` containing the full draft

   **handover-actionability-reviewer** — prompt contains the draft ONLY, inside a `# Draft` fenced block. Do NOT include git evidence, working directory, or conversation context. The point is to simulate a cold reader.

   **handover-safety-reviewer** — prompt contains the draft ONLY, inside a `# Draft` fenced block. Same rationale: no extra context.

5. **Revise the draft once.** Apply all three reports.
   - For **safety findings**: redact with `<REDACTED:kind>` placeholders. Never write the original secret to the file, even in a "for reference" note.
   - For **actionability findings**: fill in missing paths / commands / identifiers from your conversation context. If something genuinely cannot be specified, mark it explicitly as `(undecided)` rather than leaving it vague.
   - For **coverage findings**: add missed files / decisions / dead-ends.
   - If a reviewer returned empty / errored / timed out, append a footnote `_Review note: <axis> reviewer skipped_` to the document and continue. Never block on a single reviewer failure.

6. **Save** to `OUT_FILE`.
   - If `--target` was given in step 1: write to `OUT_FILE` (the caller-supplied path) verbatim.
   - Otherwise: compute `OUT_FILE = $OUT_DIR/YYYY-MM-DD-HHMMSS-<slug>.md` where the slug is derived from the focus text (which is `$ARGUMENTS` itself in standalone mode): lowercase, replace non-alphanumeric with `-`, collapse runs of `-`, trim to 50 chars. If the focus text is empty, slug = `session`.

7. **Report.** Print: saved path (as markdown link), one-line summary of focus, list of which reviewers ran (and which skipped, if any).

## Document structure

```markdown
---
created: YYYY-MM-DD HH:MM:SS
branch: <current branch>
last_commit: <short sha + subject>
focus: <user's $ARGUMENTS text, or "general continuation" if none>
generated_by: rr:handover v1.1.0
---

# Handover — <slug>

## Suggested skills
Load on session start: <list relevant skills, e.g. superpowers:using-superpowers, plus any domain skills>

## Focus
One paragraph: what this next session is for.

## State of work
- ✅ Done: ...
- 🚧 In progress: ... (file paths, NOT pasted code)
- ⏸️ Paused: ...

## Decisions made (with rationale)
- **Chose X over Y** because ... — so the next agent does not relitigate.

## Dead-ends — DO NOT REPEAT
- Tried Z; failed because ... — so the next agent does not waste cycles.

## Open questions / blockers
- ...

## Concrete next steps
1. Run `...`
2. Edit `path/to/file.ext:LINE` to ...
3. ...

## Reference artifacts
Links only — never duplicated:
- PR: ...
- Plan: ...
- ADR: ...
- Issue: ...

---
_Reviewed by: coverage, actionability, safety_
```

## Common failures the reviewers catch

| Failure | Caught by |
|---|---|
| Leaked API key / connection string / password | safety |
| Internal hostname or customer name in plain text | safety |
| Vague "fix the bug" with no path | actionability |
| Says "use the helper" but no file path given | actionability |
| Commit hash mentioned but file changes not enumerated | coverage |
| Dead-end discussed in session but missing from doc | coverage |
| No "suggested skills" section | actionability |
| Pasted-in code blocks (use file refs instead) | coverage |
