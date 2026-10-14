---
name: to-issues
description: Slice an approved spec into tracer-bullet GitHub sub-issues. Use when a spec or PRD issue needs an implementation breakdown, the user says "to issues" or "slice it up", or when rr-workshop:orchestrated-run reaches its breakdown stage.
---

The spec is approved; now break it into **tracer bullets** — vertical-slice sub-issues hanging off the spec. The tree encodes containment (spec at the root, slices as native sub-issues of it); the **blocking edges** in each body encode order. Those edges decide how parallel the downstream run can be, and they set each slice's place on the **frontier** — the open, unblocked, unclaimed children of a parent.

**Standing rule:** every blocking edge is a finding, so `rr-workshop:defending-findings` applies. An edge ships as a **defended edge**: one line naming the data dependency, the consumed interface, or the schema-forced migration order that makes it real. A false edge serializes the run for nothing; a missing edge breaks integration order.

## Steps

### 1. Gather the parent

The source is the spec issue — or any parent issue being broken down. Sub-issuing requires a parent; if none was passed, ask the user for one before continuing.

```bash
gh api repos/{owner}/{repo}/issues/PARENT_NUMBER --jq '{number, title}'
```

Use the literal `{owner}/{repo}` placeholders — `gh api` fills them from the clone; a bare `OWNER/REPO` 404s.

Read the parent's full body and comments; note its `scope:` — slices typically inherit it. Ground in the code the spec touches: slice titles and bodies use the project's glossary vocabulary and respect its ADRs. Slicing is also where prefactoring surfaces — make the change easy, then make the easy change; any prefactoring becomes the earliest slices.

### 2. Draft the vertical slices

Draft against [references/slice-template.md](references/slice-template.md). Its ground rules — end-to-end behaviour, criteria checkable by a cold agent, no file paths — govern what a slice *is*, not merely how it renders later.

Each slice is a **tracer bullet**:

- A **narrow but COMPLETE path through every layer** (schema, API, UI, tests) — vertical. "Persistence", "API layer", "UI" are not slices; "the user sees X happen end-to-end" is.
- **Demoable or verifiable on its own** once done.
- **Sized to a single fresh context window** — one agent, starting cold, can carry it to done.
- Many thin slices over few thick ones; prefactoring slices first.

Mark each slice **HITL** (needs a human — architectural decision, design review) or **AFK** (implementable and mergeable unattended). Prefer AFK. The marking is consequential: it picks the slice's `state:` label at step 4, which is what keeps a human-decision slice out of an unattended run.

Give each slice its **blocked by** set — the slices that must complete before it can start, each one a defended edge. A slice with no blockers can start immediately.

**The exception — wide refactors.** A **wide refactor** is one mechanical change — rename a column, retype a shared symbol, migrate a representation (money to integer cents, say) — whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Never force one into a tracer bullet — "add the new type, then migrate everything" is this mistake. Sequence it as **expand–contract**:

1. **Expand** — one slice that adds the new form beside the old, so nothing breaks. Both representations coexist; every existing caller still compiles and passes.
2. **Migrate** — move call sites to the new form in batches sized by blast radius (per package, per directory), each batch its own slice blocked by the expand. CI stays green batch to batch because the old form still exists.
3. **Contract** — one slice that deletes the old form once no caller remains, blocked by every migrate batch.

When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify slice — green is promised only there.

**Completion criterion.** Three conditions hold before anything is presented:

1. **Coverage.** Walk the spec section by section and name the slice that carries each requirement. An unclaimed requirement is a missing slice, not an accepted omission. Record the walk as a **coverage map** — spec section → slice number — which step 3 presents.
2. **Acyclic.** The proof is a **publish order**: an ordering of the slices in which every blocker precedes what it blocks. Produce one. If no such order exists there is a cycle — cut its weakest edge and re-defend the rest.
3. **Every edge is a defended edge.**

### 3. Approve the breakdown — the gate before anything exists

The artifact under review is the whole breakdown, rendered. In publish order, per slice:

> **N. `<title>`** — HITL | AFK — `type: <t>` · `scope: <s>`
>
> …the slice's body, rendered per [references/slice-template.md](references/slice-template.md)…

Then the coverage map, and this line, plainly: **nothing exists on GitHub yet.** What the user approves is the exact text that will be published.

Ask, as a checklist over that artifact:

- Does the granularity feel right? (too coarse / too fine)
- Should any slices be merged or split?
- **Which edges are load-bearing?** Every defended edge must survive this — cut the ones that don't.
- The slices are listed in publish order, every blocker ahead of what it blocks — which is the proof the edge set has no cycle. Does anything sit in the wrong place in that order?
- Does the coverage map miss anything the spec asks for?
- Is the HITL/AFK marking right? A HITL slice is parked out of any unattended run.
- Are `type:` and `scope:` right?

**A checklist, deliberately, rather than `rr-workshop:grilling`.** Grilling's one-question-at-a-time law serves an open design tree, where the next question depends on the last answer. Here the artifact is already rendered and these questions are independent — and granularity can only be judged against the whole set, so spreading them over six messages hides the thing being judged. When an answer *does* open a design question — a disputed edge, a slice that turns out to be two — take that thread through grilling, then come back to the checklist.

Iterate until the user **explicitly approves**. That approval message is what step 4 runs on.

### 4. Publish — one slice at a time, create → verify

Publish in the step-2 order (blockers first) so every `## Blocked by` references a real issue number.

**Do both steps for ONE slice, fully, before starting the next: create the issue, then verify the link.** Run the exact command blocks from the "Create → verify" section of [../../docs/github-operations.md](../../docs/github-operations.md); they encode two recurring footguns — the verify list needs `--paginate` (a single un-paginated page falsely reports children past 30 as missing), and the verify check needs its `|| { …; exit 1; }` tail (a bare `&&`/`||` chain always exits 0, so a missing link slips past). `--parent` attaches the sub-issue relationship in the same creation call but can still fail silently; the verify step is what catches that. Accumulate each created number in the `CREATED` file as the block does — step 5 consumes it.

**Flags on creation** — one `--label` flag each, plus the native fields this slice carries:

```
--label "state: <ready-for-agent | ready-for-human>" --label "type: <t>" --label "scope: <s>" \
--parent PARENT_NUMBER --type <native-mapped-type> --blocked-by <n1,n2,...>
```

**`state:` carries the HITL/AFK marking — that label is its whole wire out.** AFK ⇒ `ready-for-agent`; HITL ⇒ `ready-for-human`. Either engine's pre-flight halts on a slice reserved for a human, so a correctly labelled HITL slice surfaces to the human instead of being handed to a dispatched agent. Neither value is `needs-triage`: triage already happened — the human approved the spec at the **Spec** gate and this breakdown at step 3, and `needs-triage` would deadlock the pipeline. When the repo lacks the `state:`/`type:`/`scope:` taxonomy, create without the missing labels and tell the user — taxonomy labels are pre-seeded team vocabulary, never created here.

`--type` is the native Issue Type, coarse-mapped from `<t>` per the "Native issue type" table in [github-operations.md](../../docs/github-operations.md). `--blocked-by` takes the issue numbers of every blocker in this slice's `## Blocked by`; publishing in dependency order is what guarantees they already exist. **No `--assignee`** — slices stay unassigned so "unassigned = unclaimed" stays true for anything surveying the tree before a run launches, whether a human or the frontier query in github-operations.md. Assignment happens at claim time.

**If create or verify fails, STOP and surface the error to the user.** The parent relationship is structural — set by `--parent`, confirmed by the verify step — so a slice whose link is unproven is not published.

### 5. Closing verification — the set difference

After the last slice, prove the whole batch landed: run the `comm -23` set-difference check from the "Closing verification" section of [../../docs/github-operations.md](../../docs/github-operations.md) — every number in `CREATED` against the parent's actual sub-issue list. Require **empty output**. Then report "**N slices created, N verified** as sub-issues of #PARENT" and remove the `CREATED` file. If it prints numbers, those links are missing — name them and stop; do not declare success.

The parent stays untouched throughout: sub-issuing is additive — no body edit, no label change, no close.

Hand off: this tree is what `rr-workshop:orchestration` implements — its pre-flight reads it and builds the dependency graph from these edges.

## Signals — stop and take the positive move

| Signal | Positive move |
|---|---|
| A blocker whose evidence is "it feels safer to do X first" | Sequencing preference is not a defended edge. Cut it and let the two slices run in parallel. |
| A spec paragraph you cannot name a slice for | That is a missing slice. Draft it, or have the user rule it out of scope explicitly. |
| A chain of blockers that arrives back at a slice you already passed | A cycle. Cut its weakest edge and re-defend the rest before publishing anything. |
| `state: needs-triage` forming on a slice | Triage is done. AFK ⇒ `ready-for-agent`, HITL ⇒ `ready-for-human`. |
| An edit, label, or close forming on the parent | Sub-issuing is additive — leave the parent exactly as found. |
| A slice body growing a fourth section | Keep to the three: What to build, Acceptance criteria, Blocked by. |
| Non-empty `comm -23` output with a success report forming anyway | Name the unlinked numbers and stop there. |

## Rationalizations — the two hard rules

The gate (step 3) and create-then-verify-each (step 4) are where this skill gets talked out of itself.

| Excuse | Reality |
|---|---|
| "The user approved the spec, so the breakdown is approved" | The Spec gate approved *what* to build. The breakdown is *how it is cut* — a separate artifact needing its own approval message. |
| "The breakdown is obviously right; approval is a formality" | Then it costs one message. A wrong cut caught in the draft is an edit; caught after publishing it is twelve live issues to unpick. |
| "They said 'go ahead and file them'" — said before seeing the breakdown | That approves the intent, not the cut. Render the artifact, then ask. |
| "I'll create them all and verify the links in one pass at the end" | The pass at the end is precisely what context pressure drops. Create one, verify one. |
| "The last six `--parent` calls attached fine" | Silent attach failure is the failure being defended against; a run of successes says nothing about the next call. |
| "Step 5's set difference catches any missing link anyway" | It reports the damage after N issues are live. Per-slice verify stops at the first one. |

## Done when

- [ ] Every section of the spec maps to a named slice, and the coverage map was shown to the user.
- [ ] The edge set is acyclic — the publish order is a topological order of it — and every edge is a defended edge.
- [ ] The user's explicit approval of the rendered breakdown exists, and it predates the first `gh issue create`.
- [ ] Every slice was individually created, linked as a sub-issue of the parent, and verified — one slice fully before the next.
- [ ] The closing set difference printed nothing, and "N slices created, N verified as sub-issues of #PARENT" was reported.
- [ ] Every slice body carries exactly the three sections: What to build, Acceptance criteria, Blocked by.
- [ ] Every AFK slice carries `state: ready-for-agent` and every HITL slice `state: ready-for-human`, plus `type:` + `scope:` — or the missing taxonomy was surfaced to the user.
- [ ] Any wide refactor is sequenced expand → migrate batches → contract, never a single slice.
- [ ] The parent is as it was found.
