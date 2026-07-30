---
name: to-spec
description: Use when the way is clear and the user wants the spec (PRD) written — "to spec", "write the PRD" — or when rr-workshop:orchestrated-run reaches its spec stage.
---

The way is clear — the deciding is done. This skill **synthesizes** what was decided into a **spec** (you may know it as a PRD), published as a GitHub issue the rest of the pipeline builds from. Synthesis, not interviewing: wayfinder and grilling already asked the questions, and re-opening them now is this skill's defining failure. The user is consulted at exactly two points — the seam check (step 3) and the approval (step 5).

**Standing rule:** every seam choice and Implementation Decision is a finding — `rr-workshop:defending-findings` applies throughout. Each ships as a **defended decision**, in the three parts [references/spec-template.md](references/spec-template.md) fixes.

**Glossary inline:** take each new or sharpened term through `rr-workshop:domain-modeling` the moment it crystallizes, not as a batch at the end.

## Steps

### 1. Gather the inputs

- **Pipeline-invoked** (a wayfinder map exists): load the map's Decisions-so-far as the index and **zoom on demand** — fetch a linked ticket's resolution comment whenever its decision bears on what you're writing. The map is the conversation.
- **Standalone** (no map): the current conversation and codebase understanding are the inputs.

Either way, ground in the repo: read the code the spec touches, write in the project's domain glossary vocabulary, and respect ADRs in the area.

Gathering is done when every decision the spec will cite is in hand at full resolution — zoomed from its ticket, not carried as the map's one-line summary.

### 2. Sketch the modules and seams

Sketch the modules to build or modify and the seams the feature will be tested at. Read [references/architecture-language.md](references/architecture-language.md) and use its terms exactly.

Principles:

- **The deletion test**, on every proposed module. Delete it in your head: if complexity reappears across N callers, the module earns its keep; if complexity just vanishes, it was a pass-through — cut it.
- **Prefer existing seams**, at the highest point possible. Fewer seams is better; the ideal count is one.
- **Two adapters make a seam real.** One adapter is a hypothetical seam — introduce a new one only when something actually varies across it.
- **Prefer depth** — a lot of behaviour behind a small interface. Depth is a property of the interface, not the implementation: a deep module can be composed internally of small swappable parts its interface never exposes.
- **The interface is the test surface.** Callers and tests cross the same seam; wanting to test _past_ an interface means the module is the wrong shape.

The sketch is done when every proposed module carries a deletion-test verdict and every new seam names its two adapters.

### 3. Check the seams with the user

Present the sketch — modules, seams, deletion-test verdicts — and ask both:

1. Does this shape match what they expect?
2. **Which modules do they want tested?**

This is the one design question synthesis cannot settle alone. Iterate until both are settled, then **echo the named module list back** before moving on: that list is a hard input to the spec's Testing Decisions, and step 4 renders it verbatim.

### 4. Draft locally

Render the spec per [references/spec-template.md](references/spec-template.md), starting with the metadata header the template specifies. Name modules in prose — the template's ground rules govern paths and snippets. Write it to a local draft:

- `docs/specs/<slug>.md` when the repo has a `docs/` directory
- `<slug>.md` at the repo root otherwise

(`<slug>` = kebab-case of the spec title.) Tell the user the path, and that the spec is **local only** — publishing waits for the **Spec** gate.

### 5. Iterate to explicit approval — the Spec gate

Present the draft, apply the user's edits to the file, re-show. Loop until the user **explicitly approves**. That approval **is the pipeline's Spec gate**: the human sign-off before anything downstream — slices, agents, code — can exist. `gh issue create` runs only after the approval message exists.

### 6. Publish, link, verify, index

1. **Create** the issue from the approved draft:

   ```bash
   gh issue create --title "<title>" --body-file docs/specs/<slug>.md \
     --label "type: <type>" --label "scope: <scope>" \
     --assignee @me --type PRD \
     ${MAP_NUMBER:+--parent "$MAP_NUMBER"} \
     ${FITTING_MILESTONE:+--milestone "$FITTING_MILESTONE"}
   ```

   One `--label` flag per label. `$MAP_NUMBER` is set when a wayfinder map exists; `$FITTING_MILESTONE` only when an existing open milestone already covers this spec — reuse one, never create one. Taxonomy labels are pre-seeded team vocabulary, so when the repo lacks the `type:`/`scope:` taxonomy, create without those flags (label mechanics in [../../docs/github-operations.md](../../docs/github-operations.md)). `state:` labels belong on slices — `rr-workshop:to-issues` applies them.

   **If the command exits non-zero, STOP and surface the error** — it did not publish. On success, **echo the issue URL** to the user.

2. **Verify the link** — when a map exists, confirm the spec attached as a native sub-issue of the map (`--paginate` verify per [github-operations.md](../../docs/github-operations.md)'s "Create → verify"). `--parent` at creation can fail to attach silently, and this check is what catches it.

3. **Index on the map** — append the destination-reached entry to the map's Decisions so far: `[<spec title>](<url>) — destination reached: spec published`. The spec subtree carries the effort from here.

4. Point at the next step: `rr-workshop:to-issues` to break the spec into slice sub-issues.

## Done when

- [ ] The user acknowledged the seam sketch.
- [ ] The user named the modules to test, and that list was echoed back before drafting.
- [ ] Every proposed module carries a deletion-test verdict, and every new seam names two adapters.
- [ ] Local draft file exists at the stated path.
- [ ] The publish command ran only after an explicit approval message — the Spec gate passed.
- [ ] The new issue URL was echoed to the user.
- [ ] When a map exists: the spec is linked and verified as a sub-issue of the map, and the destination-reached entry sits in the map's Decisions so far.
- [ ] Every Implementation Decision ships as a defended decision.
- [ ] Testing Decisions names exactly the modules the user picked at the seam check.
- [ ] The glossary reflects every term this spec introduced or sharpened.
