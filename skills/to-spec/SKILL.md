---
name: to-spec
description: Synthesize resolved understanding — a wayfinder map's decisions or the current conversation — into a spec (PRD) published as a GitHub issue after explicit approval. Use when the way is clear and the user wants the spec written, says "to spec" or "write the PRD", or when rr-workshop:orchestrated-run reaches its spec stage.
---

The way is clear — the deciding is done. This skill **synthesizes** what was decided into a **spec** (you may know it as a PRD), published as a GitHub issue the rest of the pipeline builds from. Synthesis, not interviewing: wayfinder and grilling already asked the questions, and re-opening them now is this skill's defining failure. The user is consulted at exactly two points — the seam check (step 3) and the approval (step 5).

**Standing rule:** every seam choice and Implementation Decision is a finding — `rr-workshop:defending-findings` applies throughout. A decision ships as a **defended decision**: one falsifiable claim, its evidence cited inline, its alternatives named with the attack that killed each.

**Glossary inline:** take each new or sharpened term through `rr-workshop:domain-modeling` the moment it crystallizes, not as a batch at the end.

## Steps

### 1. Gather the inputs

- **Pipeline-invoked** (a wayfinder map exists): load the map's Decisions-so-far as the index and **zoom on demand** — fetch a linked ticket's resolution comment whenever its decision bears on what you're writing. The map is the conversation.
- **Standalone** (no map): the current conversation and codebase understanding are the inputs.

Either way, ground in the repo: read the code the spec touches, write in the project's domain glossary vocabulary, and respect ADRs in the area.

### 2. Sketch the modules and seams

Sketch the modules to build or modify and the seams the feature will be tested at, in the vocabulary of [references/architecture-language.md](references/architecture-language.md) used exactly — module, interface, seam, adapter, depth, leverage, locality.

- **Deletion test on every proposed module**: delete it in your head — if complexity reappears across N callers, the module earns its keep; if complexity just vanishes, it was a pass-through — cut it.
- **Prefer existing seams**, at the highest point possible. Fewer seams is better; the ideal count is one.
- **A new seam must name two adapters.** One adapter is a hypothetical seam; introduce one only when something actually varies across it.
- Prefer **depth**: a lot of behaviour behind a small interface, testable at that interface.

### 3. Check the seams with the user

Present the sketch — modules, seams, deletion-test verdicts — and ask whether it matches their expectations and which modules they want tests for. This is the one design question synthesis cannot settle alone. Iterate until the user acknowledges the sketch.

### 4. Draft locally — nothing on GitHub yet

Render the spec per [references/spec-template.md](references/spec-template.md), including its metadata header (title; `type:` — default `feat`, offer to override; `scope:` where the repo's label taxonomy exists). Write it to a local draft:

- `docs/specs/<slug>.md` when the repo has a `docs/` directory
- `<slug>.md` at the repo root otherwise

(`<slug>` = kebab-case of the spec title.) Tell the user the path, and state plainly: **nothing has been created on GitHub yet.**

### 5. Iterate to explicit approval — Gate 1

Present the draft, apply the user's edits to the file, re-show. Loop until the user **explicitly approves**. That approval **is Gate 1 of the pipeline**: the human sign-off before anything downstream — slices, agents, code — can exist. `gh issue create` runs only after the approval message exists; settling the content locally first is the whole point.

### 6. Publish, link, verify, index

1. **Create** the issue from the approved draft:

   ```bash
   gh issue create --title "<title>" --body-file docs/specs/<slug>.md \
     --label "type: <type>" --label "scope: <scope>" \
     --assignee @me --type PRD \
     ${MAP_NUMBER:+--parent "$MAP_NUMBER"} \
     ${FITTING_MILESTONE:+--milestone "$FITTING_MILESTONE"}
   ```

   A separate `--label` flag per label — never one comma-joined string. When the repo lacks the `type:`/`scope:` taxonomy, create without labels: taxonomy labels are pre-seeded team vocabulary, never created here (label mechanics in [../../docs/github-operations.md](../../docs/github-operations.md)). The spec is a **parent**, so it never carries `state: ready-for-agent` — slices earn that label in `rr-workshop:to-issues`.

   `--assignee @me` — the spec is a singleton parent with no claiming model, so assigning its creator is safe (contrast with `to-issues` slices, which must stay unassigned — see [github-operations.md](../../docs/github-operations.md)'s "Assignee on creation"). `--type PRD` is the native Issue Type and is **unconditional** — a spec is structurally a PRD regardless of what its `type:` label says the underlying work is; the two are different dimensions, not duplicates. `--parent` is passed only when a wayfinder map exists (`$MAP_NUMBER` set) — replaces the old create-then-manually-attach approach. `--milestone` is passed only when an existing open milestone already fits (`$FITTING_MILESTONE` set from checking whether the map, or an obviously-matching open milestone, already covers this spec) — never create one.

   **If the command exits non-zero, STOP and surface the error** — do not claim it published. On success, **echo the issue URL** to the user.

2. **Verify the link** — when a map exists, confirm the spec attached as a native sub-issue of the map (`--paginate` verify per [github-operations.md](../../docs/github-operations.md)'s "Create → verify"); `--parent` at creation can still fail to attach silently.

3. **Index on the map** — append the destination-reached entry to the map's Decisions so far: `[<spec title>](<url>) — destination reached: spec published`. The spec subtree carries the effort from here.

4. Point at the next step: `rr-workshop:to-issues` to break the spec into slice sub-issues.

## Red flags — STOP

- An Implementation Decision that reads as a bare assertion — no falsifiable claim, no inline evidence, no killed alternative.
- About to ask the user a question a closed ticket already answers — zoom the ticket instead.
- `gh issue create` forming before the user's explicit approval message exists.
- A new seam with one adapter.
- A file path or code snippet in the draft — unless it's a trimmed prototype snippet encoding a decision (the template's one exception).

## Done when

- [ ] Seam sketch acknowledged by the user.
- [ ] Local draft file exists at the stated path.
- [ ] The publish command ran only after an explicit approval message — Gate 1 passed.
- [ ] The new issue URL was echoed to the user.
- [ ] When a map exists: the spec is linked and verified as a sub-issue of the map, and the destination-reached entry sits in the map's Decisions so far.
- [ ] Every Implementation Decision carries inline evidence.
- [ ] The glossary reflects every term this spec introduced or sharpened.
