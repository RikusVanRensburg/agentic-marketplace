---
name: to-issues
description: Slice an approved spec into tracer-bullet GitHub sub-issues — vertical slices with blocking edges, labelled ready for agents. Use when a spec or PRD issue needs an implementation breakdown, the user says "to issues" or "slice it up", or when rr-workshop:orchestrated-run reaches its breakdown stage.
---

The spec is approved; now break it into **tracer bullets** — vertical-slice sub-issues hanging off the spec. The tree encodes containment (spec at the root, slices as native sub-issues of it); the **blocking edges** in each body encode order. Downstream, `rr-workshop:orchestration` works the **frontier** — the slices whose blockers are all done — so the edges decide how parallel the run can be.

**Standing rule:** every blocking edge is a finding — `rr-workshop:defending-findings` applies. A false edge serializes the run (it shrinks the frontier for nothing); a missing edge breaks integration order. An edge ships only with the evidence that makes it real: a data dependency, an interface the blocked slice consumes, a migration order the schema forces.

## Steps

### 1. Gather the parent

The source is the spec issue — or any parent issue being broken down. Sub-issuing requires a parent; if none was passed, ask the user for one before continuing. Fetch it and capture both its number and its internal integer `id` up front (the sub-issue API takes the `id`, not the number):

```bash
gh api repos/{owner}/{repo}/issues/PARENT_NUMBER --jq '{number, id, title}'
```

Use the literal `{owner}/{repo}` placeholders — `gh api` fills them from the clone; a bare `OWNER/REPO` 404s.

Read the parent's full body and comments; note its `scope:` — slices typically inherit it. Ground in the code the spec touches: slice titles and bodies use the project's glossary vocabulary and respect its ADRs. Slicing is also where prefactoring surfaces — make the change easy, then make the easy change; any prefactoring becomes the earliest slices.

### 2. Draft the vertical slices

Each slice is a **tracer bullet**:

- A **narrow but COMPLETE path through every layer** (schema, API, UI, tests) — vertical, never a horizontal slice of one layer. "Persistence", "API layer", "UI" are not slices; "the user sees X happen end-to-end" is.
- **Demoable or verifiable on its own** once done.
- **Sized to a single fresh context window** — one agent, starting cold, can carry it to done.
- Many thin slices over few thick ones; prefactoring slices first.

Mark each slice **HITL** (needs a human — architectural decision, design review) or **AFK** (implementable and mergeable unattended). Prefer AFK.

Give each slice its **blocking edges** — the slices that must complete before it can start. A slice with no blockers can start immediately. Defend every edge (standing rule above).

**The exception — wide refactors.** A **wide refactor** is one mechanical change — rename a column, retype a shared symbol, migrate a representation (money to integer cents, say) — whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Never force one into a tracer bullet — "add the new type, then migrate everything" is this mistake. Sequence it as **expand–contract**:

1. **Expand** — one slice that adds the new form beside the old, so nothing breaks. Both representations coexist; every existing caller still compiles and passes.
2. **Migrate** — move call sites to the new form in batches sized by blast radius (per package, per directory), each batch its own slice blocked by the expand. CI stays green batch to batch because the old form still exists.
3. **Contract** — one slice that deletes the old form once no caller remains, blocked by every migrate batch.

When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify slice — green is promised only there.

### 3. Quiz the user — approval before anything exists

Present the breakdown as a numbered list. Per slice:

- **Title**
- **HITL/AFK**
- **Blocked by** — the edges, each with its evidence
- **What it delivers** — the end-to-end behaviour it makes work
- **Labels** — `type:` (`feat` for new behaviour, `refactor` for restructuring, `fix` for bug-driven) and `scope:` (usually inherited)

Ask:

- Does the granularity feel right? (too coarse / too fine)
- **Which edges are load-bearing, and what's the evidence?** Every edge must survive this — cut the ones that don't.
- Should any slices be merged or split?
- Is the HITL/AFK marking right?
- Are `type:` and `scope:` right?

Iterate until the user explicitly approves. **`gh issue create` runs only after the approval message exists.**

### 4. Publish — one slice at a time, create → verify

Publish in dependency order (blockers first) so every `## Blocked by` references a real issue number. Render each body per [references/slice-template.md](references/slice-template.md).

**Do both steps for ONE slice, fully, before starting the next: create the issue (attaching it as a sub-issue of the parent in the same call), verify the link.** Never batch-create and loop back to verify — under context pressure the verify loop is exactly what gets dropped, which is the failure this ordering prevents.

Run the exact command blocks from the "Create → verify" section of [../../docs/github-operations.md](../../docs/github-operations.md); they encode two recurring footguns — the verify list needs `--paginate` (a single un-paginated page falsely reports children past 30 as missing), and the verify check needs its `|| { …; exit 1; }` tail (a bare `&&`/`||` chain always exits 0, so a missing link slips past). `--parent` attaches the sub-issue relationship in the same call as creation, but can still fail to attach silently — the verify step is what catches that. Accumulate each created number in the `CREATED` file as the block does — step 5 consumes it.

**Flags on creation** — labels each as a separate `--label` flag, plus the native fields this slice carries:

```
--label "state: ready-for-agent" --label "type: <t>" --label "scope: <s>" \
--parent PARENT_NUMBER --type <native-mapped-type> --blocked-by <n1,n2,...>
```

`ready-for-agent`, not `needs-triage`: triage already happened — the human approved the spec (Gate 1) and this breakdown (step 3) — and `rr-workshop:orchestration`'s pre-flight refuses slices that aren't ready, so `needs-triage` would deadlock the pipeline. When the repo lacks the `state:`/`type:`/`scope:` taxonomy, create without the missing labels and tell the user — taxonomy labels are pre-seeded team vocabulary, never created here.

`--type` is the native Issue Type, coarse-mapped from the label's `<t>` per [github-operations.md](../../docs/github-operations.md)'s "Native issue type" table: `feat→Feature`, `fix→Bug`, `refactor`/`chore`/`docs→Task`. It is additive to the `type:` label, never a replacement — the label keeps its full granularity, native type is deliberately coarser. `--blocked-by` takes the issue numbers of every blocker named in this slice's `## Blocked by` section — because slices publish in dependency order, every blocker already has a real number by the time this flag is set. **No `--assignee`** — slices must stay unassigned at creation so `rr-workshop:orchestration`'s frontier query (which filters on unassigned, open, unblocked issues) can find them; assignment only happens later, at claim time.

**If create or verify fails, STOP and surface the error to the user.** Do not continue to the next slice, and do not fall back to a markdown "Parent:" line in the body.

### 5. Closing verification — the set difference

After the last slice, prove the whole batch landed: run the `comm -23` set-difference check from the "Closing verification" section of [../../docs/github-operations.md](../../docs/github-operations.md) — every number in `CREATED` against the parent's actual sub-issue list. Require **empty output**. Then report "**N slices created, N verified** as sub-issues of #PARENT" and remove the `CREATED` file. If it prints numbers, those links are missing — name them and stop; do not declare success.

The parent stays untouched throughout: sub-issuing is additive — no body edit, no label change, no close.

Hand off: the breakdown is what `rr-workshop:orchestration` implements — its pre-flight reads this tree and fans out across the frontier.

## Red flags — STOP

- A slice named after a layer ("persistence", "API", "UI") — horizontal; recut it as an end-to-end path.
- One slice that adds a new form AND migrates every caller — a wide refactor missing its expand phase; sequence expand → migrate batches → contract.
- `gh issue create` forming before the user's approval message exists.
- Issues created in a batch with verification left "for after" — create and verify each slice before the next.
- An edge you can't evidence, or a dependency you know exists with no edge for it.
- `state: needs-triage` on a slice — that deadlocks the pipeline; slices leave here ready-for-agent.
- About to edit, label, or close the parent.
- Non-empty `comm -23` output and a success report forming anyway.

## Done when

- [ ] The user's explicit approval of the breakdown exists, and it predates the first `gh issue create`.
- [ ] Every slice was individually created, linked as a sub-issue of the parent, and verified — one slice fully before the next.
- [ ] The closing set difference printed nothing, and "N slices created, N verified as sub-issues of #PARENT" was reported.
- [ ] Every slice body carries exactly the three sections: What to build, Acceptance criteria, Blocked by.
- [ ] Every slice carries `state: ready-for-agent` + `type:` + `scope:` — or the missing taxonomy was surfaced to the user.
- [ ] Any wide refactor is sequenced expand → migrate batches → contract, never a single slice.
- [ ] The parent is untouched.
