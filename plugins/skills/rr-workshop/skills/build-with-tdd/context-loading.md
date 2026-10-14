# Full-Context Load (issue-driven work)

Before writing or changing any code on an issue — and again inside any QA pass — load the **entire** context tree, not just the one issue you were handed. Skimping here is the most common cause of work that technically matches the issue text but violates the parent's intent, duplicates a sibling slice, or ignores a decision recorded in a comment.

GitHub is this skill's only supported tracker (matching `rr-workshop:orchestration`'s own prerequisite) — the worked example below is the whole procedure, not a stand-in for a repo-specific doc.

## What to read — all of it

1. **The issue itself** — full body **and every comment**, plus its labels and assignee. Read the `## Acceptance criteria` in full; they are the contract.
2. **The parent issue** — full body and **every comment**. A sub-issue is a slice of the parent; the parent holds the problem statement, cross-cutting decisions, and the "out of scope" list that the slice text omits.
3. **Every sibling sub-issue** of that parent — so you don't re-build, contradict, or collide with an adjacent slice. Read sibling **acceptance criteria** in full; read a full sibling body only when it is a declared "Blocked by" dependency or otherwise clearly relevant.
4. **Any "Blocked by" dependencies** named in the body — their bodies, acceptance criteria, and how they were resolved.

## Worked example

```bash
# The issue + all comments + acceptance criteria (the rendered markdown body):
gh issue view <N> --comments

# Its parent (REST sub-resource — `gh issue view --json` does NOT expose a parent field):
PARENT=$(gh api repos/{owner}/{repo}/issues/<N>/parent --jq '.number' 2>/dev/null)
# If that fails or returns nothing, treat <N> itself as the root.

# The parent + all comments:
gh issue view "$PARENT" --comments

# Every sibling (the parent's sub-issues — always --paginate):
gh api --paginate repos/{owner}/{repo}/issues/"$PARENT"/sub_issues --jq '.[].number'
# …then `gh issue view <sibling> --comments` for each (acceptance criteria at minimum).
```

## Gate — do not write code until every box is checked

```
[ ] Read the issue body + ALL comments + acceptance criteria
[ ] Read the parent body + ALL comments
[ ] Read every sibling sub-issue's acceptance criteria
[ ] Read every "Blocked by" dependency
[ ] Reconciled this slice against its siblings — no duplication or contradiction
```

If you cannot resolve a parent or siblings (e.g. the issue has no parent link), say so and proceed treating the issue as standalone — but do not skip the read silently.
