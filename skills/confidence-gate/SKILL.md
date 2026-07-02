---
name: confidence-gate
description: |
  Use when about to produce or modify a non-trivial artifact — code, spec, design, documentation, plan, migration, config, schema — after planning, before the producing action runs. Triggers: "let's implement", "code it up", "apply the plan", "write the spec", "draft the doc", "build the design", "ship it", "make the changes", "/confidence-gate". Symptoms that signal this skill is needed: confidence has not been quantified, no duplicate scan has been run, references (APIs, tokens, citations, style-guide rules) are assumed rather than verified, a problem's root cause is asserted but not proven, the work touches unfamiliar territory, or the user said "just do it" without the plan being audited.
---

# Confidence Gate

<core-principle>
**No artifact without 90% confidence.** Before producing or modifying any non-trivial artifact — code, spec, design, documentation, plan, migration, config — run a 5-point audit and produce a quantified confidence score 0–100. Below 90 — STOP and ask the user. This gate is **objective and gating**, not subjective and reflective: it audits *production feasibility*, not user intent or design choice. If you find yourself debating user intent, you are in the wrong skill — go back to `/explore-problem-space`. **Violating the letter of the gate is violating the spirit of the gate.** While the gate is open, **read-only and search tools are allowed** (Read / Grep / Glob / `/codebase-research` / WebFetch for verification); **producing tools and actions are not.** This includes: Edit / Write / MultiEdit / NotebookEdit; Bash invocations that mutate or publish state (`git push`, `git commit`, `gh pr create`, `gh issue create`, `npm publish`, `dotnet publish`, `terraform apply`, design-system publishes, any file-system write); RemoteTrigger; MCP write-mode tools; ShareOnboardingGuide; **and equivalent non-tool actions** — publishing a Figma page, merging a spec PR, posting a doc, handing a plan to `/implement-plan`. **If unsure whether an action produces the artifact, treat it as producing.**
</core-principle>

## When to Use

| Situation | Action |
|---|---|
| Plan complete, about to produce the artifact | **Run full gate** |
| User says "implement" / "draft it" / "write it up" / "apply the plan" / "just do it" | **Run full gate** |
| Multi-file change, refactor, new feature, new module, new spec, new design | **Run full gate** |
| Bug fix where root cause is asserted but not proven | **Run full gate** |
| External reference (library API, design token, style-guide rule, citation) you have not verified in *this* project's source of truth | **Run focused gate on Reference Verification** |
| Trivial change meeting **all four** lightweight criteria below | **Lightweight gate** (Duplicate Scan + Root Cause + Score) |

**Lightweight gate eligibility** — all four must hold, and you **must** output an explicit Yes/No for each before claiming eligibility. Implicit eligibility is forbidden.
1. ≤5 lines / ≤1 paragraph / ≤1 design element changed — **Yes / No**
2. No new named entities introduced (no new functions, types, components, sections, headings, tokens, exports) — **Yes / No**
3. No new external references added (no new API calls, citations, libraries, design tokens, dependencies) — **Yes / No**
4. No new branches of logic / argument / flow (no new `if` / `try` / `await` / loops; no new claims, conditional paths, or user journeys) — **Yes / No**

Any "No" disqualifies the lightweight path and the full gate applies.

**Lightweight scoring:** When the lightweight path applies, only Duplicate Scan and Root Cause Clarity are run. Each contributes up to **50** points (Pass=50, Partial=30, Fail=0). Sum: 100 max. The 90 threshold still applies; both criteria must Pass to ship cleanly.

**Repeat-use rule:** If you have already used the lightweight path on the same feature, file, or artifact within this session, the next change escalates to the **full gate** regardless of size. Splitting a non-trivial change into sequential lightweight passes is itself a Fail of the exception-argument rule (see §Scoring).

**Definitions:**
- **Non-trivial** = fails any of the 4 lightweight criteria above.
- **Substantively equivalent** (Duplicate Scan) = same inputs, same outputs, same audience, even under a different name.
- **Neighboring / peer artifact** (Architecture Compliance) = an artifact of the same type in the same directory, or otherwise the closest analog in the project.
- **Concrete evidence** = a citable reference you can quote: file path with line number, doc URL with version, function / component name, design-token id, spec section anchor, citation key, screenshot reference. "I read it" is not evidence.

## When NOT to Use

| Situation | Redirect to |
|---|---|
| Problem is still vague, no plan exists | `/explore-problem-space` |
| Plan does not exist for a multi-step change | `/create-plan` |
| Artifact already produced, want to evaluate it | `/review-implementation` |
| Want to stress-test a formed position adversarially | `ze:red-team` |
| Generating multiple options to choose from | `superpowers:brainstorming` |
| Writing up a problem for a teammate | `/github_create-issue` |
| Want to verify completion of work already produced | `superpowers:verification-before-completion` |

## The 5-Point Audit

Run each criterion. Record a finding — **Pass / Partial / Fail** — with a one-line rationale **citing concrete evidence** (file path, doc URL, sampled function name, design-token id, spec section, citation, screenshot reference). A finding without citable evidence is at best a Partial.

<phase-1>
### 1. Duplicate Scan
**Checks:** Does this artifact — or a substantively equivalent one — already exist in the project under any name? Examples by artifact type:
- *Code:* function, component, helper, type, constant
- *Spec / design:* section, flow, screen, pattern, persona, token
- *Documentation:* topic page, guide, FAQ entry, glossary term
- *Plan:* approved plan covering the same scope

**How to run:** Delegate to `/codebase-research` — it greps any file tree, not just code. For non-code artifacts, point the same delegate at the equivalent stores: `docs/`, `openapi/` or `api/spec/`, `adr/`, `schemas/`, design-system source (Figma exports, token files), knowledge-base exports, prior PRs / issues, citation manager / bibliography, infra-as-code (`terraform/`, `helm/`, `k8s/`, `ansible/`, `pulumi/`), migrations (`migrations/`, Flyway / Liquibase / Alembic / EF Core scripts), CI/CD pipelines (`.github/workflows/`, `azure-pipelines.yml`). For code, you may also invoke the `codebase-locator` and `codebase-pattern-finder` agents directly. Do **not** re-implement search inside this skill. Search for (a) the proposed name and close variants, (b) the behavior or purpose in plain English, (c) the inputs/outputs or audience.

**Pass:** Search returned no matching artifact — cite the queries run and the directories / stores searched. OR: existing artifact reviewed and confirmed insufficient with a one-line reason.
**Fail:** Match exists and would be re-created, OR the search was skipped on a non-trivial change.
</phase-1>

<phase-2>
### 2. Architecture Compliance
**Checks:** Does the planned approach match the project's established structure, layering, conventions, and house style? "Architecture" here is broader than tech stack — it covers any system of expected shape:
- *Code:* framework, language, layering, DI patterns, module boundaries
- *Spec / design:* design system, token set, component library, IA, brand voice
- *Documentation:* doc IA, page-template, voice/tone guide, audience tier
- *Process / plan:* required phases, review gates, naming conventions

**How to run:** Read `CLAUDE.md`, `README`, `STYLEGUIDE`, design-system docs, and any architecture/contribution docs in `docs/`. Inspect 2+ peer artifacts of the same type and confirm shape, structure, naming, and conventions match.

**Pass:** Approach is indistinguishable in shape from neighboring artifacts — cite the peer file path(s) or design-system reference(s).
**Fail:** Proposing React in a Blazor app, SQL in a NoSQL store, hardcoded hex colors in a tokenized design system, a doc page that bypasses the standard IA, a plan that skips required review gates, or introducing a new dependency / convention category without justification.

**No-docs rule:** If the project has no `CLAUDE.md` / `README` / style guide / ADRs **that actually cover the relevant architectural decision**, and no peer artifacts of the same type exist, this criterion defaults to **Fail**, not Partial. File presence is not enough — the documentation must address the convention in question. You cannot Pass on inferred conventions — ask the user to confirm the intended architecture.
</phase-2>

<phase-3>
### 3. Reference & Documentation Verification
**Checks:** Are the external references the artifact depends on — APIs, signatures, design tokens, library functions, citations, style-guide rules, regulatory text — **current and real**, not stale, deprecated, or hallucinated?

**How to run:** For each non-trivial external reference, either (a) find a usage in this project (via `codebase-pattern-finder` for code, design-system source for tokens, docs index for citations), OR (b) verify against the official source pinned in the project's manifest. Manifests by artifact type:
- *Code:* `package.json`, `*.csproj`, `pyproject.toml`, `requirements.txt`, `go.mod`, `Cargo.toml`, lockfiles.
- *Spec:* `openapi.yaml` `info.version`, JSON-Schema `$id`, AsyncAPI `info.version`, GraphQL schema (Apollo registry variant / schema header convention), Protobuf `package` version.
- *Infra / migrations:* Terraform provider version (`required_providers`), Helm chart `version` + `appVersion`, k8s API version (`apiVersion`), migration tool version (Flyway/Liquibase/Alembic).
- *Design:* design-system version / token-set version, Figma library version.
- *Docs:* doc-tool version, citation-manager `.bib` file, ADR index.

Do not assume a reference exists or behaves as expected because it "should".

**Pass:** Every non-trivial external reference has a verified source — cite either an in-repo file:line, a doc URL with the matching version, or a design-system token id.
**Fail:** Any "I'm pretty sure this method / token / clause exists" or "this is how that library / spec works" without a citation.
</phase-3>

<phase-4>
### 4. Root Cause Clarity
**Checks:** Do we understand *why* this artifact is being produced — the underlying cause or goal — not just the surface request?
- *Bug fix:* WHY does the defect occur — the causal chain — not just where the symptom appears?
- *Feature / spec / design:* WHY does the user / team need this — the underlying goal — not just the literal request?
- *Doc:* WHY does the reader need this content — what task does it unblock — not just "we should document X"?
- *Plan:* WHY this sequencing of phases — what risk does the order mitigate — not just "this is the order we thought of"?

**How to run:** State the cause / goal in one sentence. *"Bug happens because X causes Y which violates Z."* / *"User needs this because their underlying goal is Z, and the artifact serves Z by …"* If the sentence contains "probably", "I think", "should", or "might", it is a Fail.

**Pass:** One-sentence causal statement, testable, without hedging words.
**Fail:** Symptom-only diagnosis, request framing that paraphrases the user's words, or any hedged sentence.
</phase-4>

<phase-5>
### 5. Confidence Score
**Checks:** Aggregate the four prior findings into a single 0–100 number and apply the STOP rule.
</phase-5>

## Scoring

Each of the first four criteria contributes up to 25 points:

| Finding | Points |
|---|---|
| **Pass** — verified, with cited evidence | 25 |
| **Partial** — mostly verified, one minor unknown remains | 15 |
| **Fail** — unverified, hallucinated, contradicts project, or skipped | 0 |

**Sum the four. That is the confidence score (0–100).**

- **Single-Fail cap:** Any single Fail caps the total at **75**, regardless of the others.
- **No upward rounding:** Partial is 15. If you're tempted to call something 18 or 20, it is Partial (15).
- **No mid-score adjustment:** If you adjust a finding upward *after* computing the total, that adjustment is itself a Fail and resets the audit.
- **The exception-argument rule:** If you find yourself constructing an argument for why *this particular case* is the exception that doesn't need the gate, **stop and Fail the relevant criterion**. The fact that you are building the argument is the evidence that the gate should hold.

**STOP rule:**
- **<90** → Do not call any producing tool or take any producing action (see core-principle for the full list). Surface findings (template below).
- **=90 exactly (e.g. 3 Pass + 1 Partial)** → Resolve the Partial to Pass with new evidence, OR have the user explicitly override that criterion by name, before proceeding.
- **>90** → Proceed to `/implement-plan` (or the equivalent producing step for non-code artifacts).

## When the Gate Fails (<90)

Do not produce the artifact. Surface the audit to the user using this template:

```
Confidence: <score>/100 — below the 90 gate. Pausing before production.

Audit findings:
1. Duplicate Scan:                 <pass/partial/fail> — <one line + evidence>
2. Architecture Compliance:        <pass/partial/fail> — <one line + evidence>
3. Reference & Doc Verification:   <pass/partial/fail> — <one line + evidence>
4. Root Cause Clarity:             <pass/partial/fail> — <one line + evidence>

To proceed I need clarification on:
1. <specific question tied to the failing criterion>
2. <specific question tied to the failing criterion>

Or, if you'd like, I can run `/codebase-research` on <X> to resolve this myself.
```

Ask **specific** questions tied to each failing criterion. Do not ask "what do you want?" — that is `/explore-problem-space`'s job and would mean the plan should not have been approved.

**User override:** The user may override a *specific failing criterion* by answering the question, OR by explicitly naming the criterion to override (e.g. "override Reference Verification", "accept Architecture risk"). **Generic phrases — "just do it", "ship it", "trust me", "proceed", "I accept the risk" without naming the criterion — do NOT constitute an override** and require re-asking. Do not offer a blanket "proceed anyway" option. Overrides are per-criterion, named by the user, logged in the audit summary, and only count for the specific criterion the user explicitly addressed.

## Red Flags — STOP and Re-Gate

If any of these thoughts appear mid-task, you skipped the gate. Stop and re-run it.

- "I'll just produce it and we'll see."
- "This is probably the right method / token / clause name."
- "I don't need to check — it's a small change."
- "I'll search the project *after* I draft the artifact."
- "The plan said do X, so I don't need to verify the reference."
- "I'll fix the symptom now and find the root cause later."
- "There's probably no existing helper / section / token for this."
- "It's similar to a pattern I've seen — close enough."
- "Confidence feels high, I don't need to score it."
- "I'll follow whatever pattern the file / page I land in uses."
- "Showing progress is more important than verifying."

## Rationalization Counters

These rationalizations are framed in code terms but apply across artifact types — substitute "spec section", "design token", "doc page", or "plan phase" for "code" / "API" / "helper" as appropriate.

| Excuse | Reality |
|---|---|
| "It's a tiny change, I don't need to scan for duplicates." | Tiny changes that duplicate existing artifacts are the most common form of project rot. |
| "Faster to write than to find." | `/codebase-research` runs sub-agents in parallel (see `plugins/core/skills/codebase-research/SKILL.md` § "Spawn Parallel Sub-Agents") — seconds, not minutes. Rewriting a duplicate costs the *team* hours. |
| "The user asked for a helper, implying they want a new one." | Users ask for outcomes, not greenfield artifacts. If it already exists, that's the outcome. |
| "Mine might be cleaner anyway." | A second clean implementation is a divergent API / section / token. Divergence is not clean. |
| "Local change, no architectural impact." | Local artifacts teach the *next* contributor how to act. One wrong-shape file compounds. |
| "It's just glue code / a stub section / a minor token." | Glue is where duplicates breed. Especially gate glue. |
| "I'll follow whatever pattern the file / page I land in uses." | The file you landed in may itself be the outlier. Check at least two peer artifacts. |
| "Intl / lodash / native is idiomatic enough." | "Idiomatic in JS / in the industry" ≠ "idiomatic in *this* project." Verify in this project. |
| "The framework / library / spec is in my head." | Memory is the #1 source of hallucinated references. Verify against the *pinned* version. |
| "The user owns the diagnosis, I just execute." | The user reports symptoms. Diagnosis is your job. Patching their guessed cause leaves the real one live. |
| "Defensive code / hedging is harmless even if the cause is elsewhere." | Defensive patches hide the real issue and accumulate. The next defect will surface somewhere new. |
| "Root-causing is scope creep." | Root-causing prevents three follow-up fixes. That's scope *contraction*. |
| "The plan was approved, so I can just produce." | The plan approved the *design*. The gate verifies the *production assumptions* underneath it. |
| "Asking will annoy the user." | Generating the wrong artifact annoys them more, wastes their review, and lowers trust. |
| "Score is 87 — close enough to 90." | The threshold exists *because* 87 feels close enough. Ask one question and get to 95. |
| "Showing progress beats stalling on verification." | Visible motion at the cost of rework is not progress. |
| "Demo pressure means ship now, polish later." | "Later" means "in review after the diff is large." Gate now. |
| "I'll know if it's wrong when I see it." | Confirmation bias makes wrong artifacts look right. Quantify before producing. |

## Integration with Other Skills

```
/explore-problem-space   →   frame the problem
        ↓
/create-plan             →   design the solution
        ↓
[ confidence-gate ]      →   verify production assumptions  ← THIS SKILL
        ↓   (≥90)
/implement-plan          →   execute (produce the artifact)
        ↓
/review-implementation   →   validate the result
```

- **`/codebase-research`** — The gate's primary delegate for Duplicate Scan and in-project Reference Verification. Never re-implement search here.
- **`/create-plan`** — Produces the plan the gate audits. The gate does **not** re-open approved design choices; it verifies the plan's production assumptions hold up.
- **`/explore-problem-space`** — Owns user-intent / Socratic conviction (its Phase 7 is subjective and qualitative). The gate is the **objective, quantitative** counterpart, immediately before production.
- **`/review-implementation`** — Runs *after* the artifact exists; the gate runs *before*. Same spirit, opposite side of the production boundary.
- **`superpowers:verification-before-completion`** — Verifies completion claims ("evidence before assertions") *after* work is produced. The gate enforces evidence *before* production. Same evidence ethos, opposite side of the production boundary.
- **`/github_create-issue`** — Its Phase 7 checks problem-statement readiness for an issue artifact, not production readiness. Different moment, different artifact.
- **`ze:red-team`** — Adversarial stress test of a *formed position*. Optional companion for high-risk changes: run it on the plan **before** the gate to surface unknowns the gate then verifies.
- **`superpowers:brainstorming`** — Divergent option generation. The gate is convergent: one plan, one score, one go / no-go.

## Anti-Patterns

| Pattern | Why It Fails |
|---|---|
| Running the gate after producing the artifact | That is `/review-implementation`. The gate's purpose is to prevent the artifact from being produced wrong. |
| Self-scoring without delegating | If you did not actually call `/codebase-research` (the same delegate works for non-code — point it at `docs/`, `openapi/`, `adr/`, design-system source, etc.), the Duplicate Scan finding is a guess — that's a Fail. |
| Self-citing without evidence | A "Pass" with no file path, doc URL, token id, or function name is a Partial at best. |
| Treating the score as advisory | <90 means STOP. Not "STOP unless I feel confident." Confidence is what we just measured. |
| Re-litigating the design | The plan is approved. The gate audits feasibility, not desirability. |
| Skipping for "obvious" changes | Obviousness is a feeling, not evidence. Confirm lightweight-gate eligibility (all 4 criteria) or run the full gate. |
| Inflating Partial findings to Pass | Partial is 15. Do not round upward to clear the threshold. |
| Blanket user-override | Override is per-failing-criterion, with a specific answer. Not a one-button bypass. |
| Negotiating the threshold | 90 is the gate. Do not lower it because the change feels easy. |

## Quick Reference

Before any Edit / Write / MultiEdit / NotebookEdit (or any equivalent producing action on a non-trivial artifact):

```
[ ] 1. Duplicate Scan       → delegated to /codebase-research with cited query?            (Fail caps at 75)
[ ] 2. Architecture Match   → matches stack / design system / IA, peer artifacts cited?     (Fail caps at 75)
[ ] 3. References & Docs    → every external reference verified to in-project or pinned source? (Fail caps at 75)
[ ] 4. Root Cause           → one-sentence causal statement, no hedging words?              (Fail caps at 75)
[ ] 5. Score ≥ 90?          → if NO, STOP and ask the user (per-criterion override).
```
