# Design: standard issue field set for `rr-workshop`

**Status:** Proposed (awaiting user review)
**Date:** 2026-07-24
**Owner:** RR
**Type:** Cross-skill mechanics change (issue creation/editing in `plugins/rr/workshop`)

## 1. Purpose

`rr-workshop`'s skills (`wayfinder`, `to-spec`, `to-issues`) and the `librarian` agent all create GitHub issues, and each independently invented its own answer to "what metadata goes on this issue." The result: several dimensions that GitHub now tracks natively (assignee, issue type, milestone, blocking relationships, parent/child) are either never set, or re-implemented as a label that duplicates a native field sitting unused right next to it.

This was confirmed against live data, not assumed:

- **Native `type`**: this org has real Issue Types configured (`Task`, `Bug`, `Feature`, `PRD` — checked via `orgs/flow-software/issue-types`). Sampled 278 issues authored by RVR in `flow-software/Timebase`: **0 of 278** have a native type set. All rely on a `type: <t>` label instead.
- **Assignee**: 20 of 278 (7%) have any assignee. Every skill only assigns later, at claim time — never at creation.
- **Milestone**: 0 of 278 have one set. The repo has exactly one milestone (`#1 CESMII`), unrelated to spec/slice work.
- **Native blocking relationships** (`issues/{n}/dependencies/blocked_by`, `.../blocking`): the endpoints are live on this repo (return `[]`, not 404) and `gh` 2.96.0 has first-class flags for them (`--blocked-by`/`--blocking` on create, `--add-blocked-by`/`--add-blocking` on edit) — but `to-issues` only ever writes a `## Blocked by` markdown section. `issue_dependencies_summary.total_blocked_by`/`total_blocking` is 0 across all 278 sampled issues.
- **Parent/child (sub-issues)**: already using the *native* mechanism, but through a manual 3-step REST dance (create → look up integer `id` → `POST sub_issues` → paginated verify) documented in `docs/github-operations.md`, because that's what existed when it was written. `gh` 2.96.0's `--parent`/`--add-sub-issue` flags now do this in one call.
- **Projects v2** (would carry `priority`/`state` as real fields): unconfirmed. The `gh` token used in this investigation lacked `read:project` scope, and no `issue_field_values` were populated on any sampled issue — so there is no evidence a Project exists that these should feed into.

This design fixes the first four; it explicitly does not attempt Projects v2 (see §6).

## 2. The standard field set

| Dimension | Mechanism | Rule |
|---|---|---|
| **Assignee** | native `assignees` | Singleton parent issues with no claiming model (the wayfinder **map**, to-spec's **spec**, librarian's archival issue) get the creator assigned at creation. **`to-issues` slices and wayfinder **tickets** stay unassigned at creation** — both have a "claim by assigning" frontier model (see §3.3) where an auto-assigned creator would make every item look claimed and empty the frontier. |
| **Type** | native `type` **+** label (both kept) | Native `type`, coarse-mapped: `feat→Feature`, `fix→Bug`, `refactor`/`chore`/`docs→Task`. **Exception:** to-spec's spec issues always get native `type: PRD` — a spec is structurally a PRD regardless of what it's chartering, not whatever `type:` label it carries. The `type:` label is unchanged and keeps its current full granularity (feat/fix/refactor/chore/docs) — native is coarser and additive, not a replacement. |
| **Scope** | label only, unchanged | No native equivalent. Inherited from parent as today. |
| **State** (workflow status) | label only, unchanged | No native issue-level equivalent; only Projects v2 has a Status field, and no Project is confirmed to exist. Out of scope — see §6. |
| **Priority** | label only, unchanged | Same reasoning as State. Out of scope — see §6. |
| **Milestone** | native, **attach-only** | Never auto-created. Attached only when an existing open milestone already fits (the parent already has one, or the user names one at the approval step); otherwise left unset. |
| **Blocking edges** | native **+** markdown (both kept) | Every edge gets `--blocked-by`/`--blocking` at creation (or `--add-blocked-by`/`--add-blocking` post-hoc when the blocker doesn't exist yet) **and** keeps the existing `## Blocked by` prose with its evidence. Native carries the machine-checkable graph; markdown carries the `defending-findings` evidence trail that native fields can't hold. Neither replaces the other. |
| **Parent/child (sub-issues)** | native, simplified mechanics | `gh issue create --parent <n>` / `gh issue edit --add-sub-issue <n>` replaces the manual `POST .../sub_issues` dance. A verify step still follows — create-with-link can still fail to attach silently, same risk the old dance already guarded against. |
| `wayfinder:<type>` labels | unchanged, out of scope | Distinct plugin-owned namespace (pipeline-stage ticket kind: research/prototype/grilling/task). Not part of the type/scope/state/priority taxonomy this design addresses. |

## 3. Per-skill changes

### 3.1 `skills/to-spec/SKILL.md` (step 6, publish)

The `gh issue create` call gains:

```
--assignee @me --type PRD
```

alongside the existing `--label "type: <t>"` / `--label "scope: <s>"`. `--type PRD` is unconditional — it does not depend on the `type:` label's value, per the exception in §2.

When a wayfinder map exists, create with `--parent <map_number>` instead of creating standalone and then manually attaching as a sub-issue afterward.

Milestone: check whether the map or an existing open milestone already fits before publishing; if so, add `--milestone <name>`. Never create one.

### 3.2 `skills/to-issues/SKILL.md` (step 4, publish)

The `gh issue create` call gains:

```
--type <native-mapped-type> --parent <PARENT_NUMBER> --blocked-by <n1,n2,...>
```

- `--type`: coarse-mapped per §2's table, computed from the slice's already-decided `type:` label value.
- `--parent`: replaces the manual create→link→verify dance from `docs/github-operations.md` — slices are always children of the spec.
- `--blocked-by`: populated with whichever blocker slice numbers already exist. Because step 4 publishes in dependency order (blockers first), every blocker referenced in a slice's `## Blocked by` section already has a real issue number by the time that slice is created — this flag is never forward-referencing.
- **No `--assignee`.** See §3.3.
- The existing `## Blocked by` markdown prose is unchanged and still required.
- The closing verification (step 5, the `comm -23` set-difference check) is unchanged — `--parent` can still fail to attach silently, same as the old manual `POST`.

### 3.3 Why slices (and wayfinder tickets) stay unassigned

`rr-workshop:orchestration`'s frontier query (`docs/github-operations.md`, "Frontier query") finds claimable work by filtering `select(.state == "open" and (.assignees | length) == 0)`. If a slice were auto-assigned to whoever ran `to-issues` (a human, or the session driving the breakdown), every slice would be born "claimed" and the frontier would always be empty — orchestration would never find anything to work. Assignment for slices must continue to happen only at claim time, via the existing `gh issue edit <n> --add-assignee @me` step. This is a hard constraint on the design, not a style choice.

**The identical constraint applies to wayfinder tickets.** `wayfinder/SKILL.md` states it directly: *"A session claims a ticket by assigning it... first, before any work"* and *"the frontier is the open, unblocked, **unclaimed** children of the map."* Auto-assigning the creator at ticket creation would empty wayfinder's own frontier the same way. So of the two wayfinder issue kinds, only the **map** — a singleton with no claiming model — gets `--assignee @me` at creation; **tickets do not**, and keep claiming exactly as documented today.

### 3.4 `skills/wayfinder/SKILL.md`

Map creation gains `--assignee @me`. Ticket creation does **not** gain `--assignee` — see §3.3.

Ticket creation gains `--type Task` unconditionally, for every `wayfinder:<type>` ticket regardless of its specific sub-type. This is pure additive value for anyone filtering the repo by native type — it loses no information since `wayfinder:<type>` remains the real, finer-grained classifier untouched, and type is a separate dimension from assignee (native type carries no claiming semantics, so it's safe to set unconditionally where assignee is not).

### 3.5 `docs/github-operations.md`

- Rewrite the "Create → link → verify" section around `--parent`/`--add-sub-issue`, keeping the verify step (paginated `sub_issues` check) — only the create+link mechanics change, not the verification discipline.
- Replace the "native dependencies are visual-layer only" caveat (§ "Native issue dependencies") with real usage instructions for `--blocked-by`/`--blocking`/`--add-blocked-by`/`--add-blocking`, now that the endpoints are confirmed live on this repo.
- Add a short "Assignee on creation" note: parent-level issues get `--assignee @me`; sub-issues (to-issues slices) do not, and why (link to §3.3's reasoning).
- Add the native-type mapping table from §2.

### 3.6 `agents/librarian.md`

The Import API (`golden-comet-preview`, undocumented) predates both Issue Types and native relationships, so it can only carry some of this in the same call:

- **Assignee**: the import payload accepts a plain `"assignee": "<login>"` field alongside `labels`/`created_at`/etc. Resolve the dispatching user's login once via `gh api user --jq .login` (the import payload needs a literal login, not the `@me` shorthand `gh issue create` understands) and set it as the default assignee.
- **Milestone**: same attach-only rule as §2 — only set (as a milestone *number* in the payload, resolved from name via `gh api .../milestones`) if an existing one already fits; never created.
- **Native `type`**: not supported by the import payload at all. Only settable as a **follow-up** `gh issue edit <n> --type <t>` call, run after the import completes — and only when `type` was actually given at dispatch (librarian's existing default is to omit type and leave it for a human to triage, which is unchanged).
- **Relationships**: blocking edges don't apply to archival issues — an archived doc is never "blocked by" another doc. Parent/child structural linking already exists (§4, "Import — parents before children"); simplify the same way as §3.5 — `gh issue edit <n> --add-sub-issue <n>` instead of the raw `POST .../sub_issues` call.
- **New guardrail**: because this is an undocumented preview API, its actual handling of `assignee`/`milestone` fields is not verified with certainty. Step 6 ("Self-verification — guilty until proven innocent") gains two checks: assignee and milestone (when given) match what was requested against **live** GitHub state — if either silently didn't land, STOP and report, exactly like every other check already in that step. No new verification machinery — this extends the existing checklist.

## 4. What doesn't change

- `scope:`, `state:`, `priority:` labels — unchanged, no native equivalent in play (see §6).
- The `type:` label's own vocabulary and the logic that decides its value per slice — unchanged; native `type` is computed *from* it, not instead of it.
- `wayfinder:<type>` labels — unchanged, separate namespace.
- The label create-if-missing mechanics for `wayfinder:*`, and the "never auto-create `type:`/`scope:`/`state:`" rule for the shared taxonomy — unchanged.
- The `## Blocked by` markdown section and the evidence discipline behind every edge (`defending-findings`) — unchanged, additive alongside native relationships.

## 5. Risk / open caveats

- **`gh` CLI version dependency.** `--parent`, `--add-sub-issue`, `--blocked-by`/`--blocking`, `--type` are all present in `gh` 2.96.0 (2026-07-02). Any environment invoking these skills with an older `gh` will hit an unrecognized-flag error. No version guard exists in the plugin today for any flag; this design doesn't add one, consistent with existing practice, but it is a new failure mode worth naming.
- **Librarian's Import API is undocumented.** The `assignee`/`milestone` payload fields are asserted from that API's historically documented behavior, not verified live in this session (creating a real backdated issue against production `Timebase` to test it was judged out of scope for a design spike). The new step 6 guardrail (§3.6) is the safety net if that assumption is wrong.
- **Native type mapping is lossy in one direction.** Coarse-mapping `refactor`/`chore`/`docs` all onto `Task` means native-type filtering can't distinguish them from each other — only the `type:` label can. This was an explicit, confirmed trade-off (§2), not an oversight.

## 6. Explicitly out of scope

- **Projects v2** (`priority`, a real `state`/Status field, or any other custom field). No Project has been confirmed to exist against this repo; checking requires the user to grant `read:project` scope (`gh auth refresh -s project`) themselves, which didn't happen during this design. If a Project does exist and gets confirmed later, `state:`/`priority:` labels should be revisited as a follow-up design, not folded into this one.

## 7. Done when

- [ ] `to-spec` creates spec issues with `--assignee @me --type PRD`, uses `--parent` when a map exists, and attaches an existing milestone if one obviously fits.
- [ ] `to-issues` creates slices with coarse-mapped `--type`, `--parent`, and `--blocked-by` for already-created blockers, with no `--assignee`, and the closing set-difference verification still runs unchanged.
- [ ] `wayfinder` creates the map with `--assignee @me` (tickets stay unassigned, per §3.3); every ticket gets native `--type Task`.
- [ ] `docs/github-operations.md` documents `--parent`/`--add-sub-issue` as the sub-issue mechanic (verify step retained), documents `--blocked-by`/`--blocking` as real (not visual-layer-only), and carries the assignee-on-creation and type-mapping notes.
- [ ] `librarian` sets assignee and attach-only milestone via the import payload, sets native `type` as a conditional follow-up edit when `type` was given at dispatch, uses `--add-sub-issue` for parent/child linking, and step 6 verifies assignee/milestone landed.
