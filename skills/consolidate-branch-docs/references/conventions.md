# Per-project docs conventions

Four patterns observed in the wild. Detect which pattern a project uses by reading its existing `docs/` (and project root). Match what's there. Only fall back to the default when a project has no established convention.

## Pattern 1 — Pure change-driven

```
<Project>/docs/
├── feat/<topic>/{spec.md, plan.md, ...}
├── fix/<topic>/{spec.md, plan.md, ...}
├── refactor/<topic>/{spec.md, plan.md, ...}
└── chore/<topic>/spec.md
```

Mirrors conventional-commits taxonomy (`feat:` / `fix:` / `refactor:` / `chore:` commit prefixes). Organizes by **the kind of change that produced the doc**.

**Detect**: existence of `docs/feat/`, `docs/fix/`, `docs/refactor/`, or `docs/chore/` as direct children of `docs/`, with no foundational `<TopicName>.md` files at the top of `docs/`.

**Strengths**: easy to scan by change type; maps cleanly to PR labels; each work unit self-contained.

**Weakness**: bad for stable foundational knowledge (e.g., API design, system spec, lifecycle model). Filing "API design" under `docs/feat/api-redesign-2026/spec.md` makes the *one redesign* look like the *thing itself*. The redesign is one chapter; the API has many.

## Pattern 2 — Hybrid (recommended default)

```
<Project>/docs/
├── <TopicName>.md            ← foundational architecture, edited over years
├── <AnotherTopic>.md
├── ADR/NNN-<decision>.md     ← optional, for sharp architectural decisions
├── feat/<topic>/...          ← change-driven, same as Pattern 1
├── fix/<topic>/...
└── refactor/<topic>/...
```

Foundational docs at the top of `docs/` alongside the change-driven subfolders. Resolves Pattern 1's weakness by giving foundational content top-level treatment while keeping change-tracking below.

**Detect**: presence of any `<TopicName>.md` directly in `docs/` (not under a `feat|fix|refactor|chore` subdir), with the change-driven subfolders alongside.

**Recommend for**: projects with both stable architectural content AND ongoing change churn. This is the **default to propose** when a project has no established convention.

## Pattern 3 — Foundational-first

```
<Project>/docs/
├── <Project>_Architecture.md
├── <Project>_Design_Doc.md
├── <Project>_System_Specification.md
├── <Project>_Glossary.md
└── ADR/NNN-<decision>.md
```

Named foundational docs at the top of `docs/`, ADRs for decisions. No `feat|fix|refactor` tier at all.

**Detect**: `docs/` populated with `<Project>_*.md` style files (or similar foundational-named files) and a `docs/ADR/` folder, but no `feat|fix|refactor|chore` subdirs.

**Recommend for**: mostly-stable systems where change churn is captured in commit history alone and the docs surface should reflect the steady-state architecture.

## Pattern 4 — Project-root foundational

```
<Project>/
├── CLAUDE.md
├── IMPLEMENTATION_PLAN.md
├── <PROJECT>_INSTANCE.md
├── docs/
│   ├── feat/<topic>/...
│   └── chore/<topic>/...
```

Foundational docs at the project root (not under `docs/`). Change-driven content under `docs/`.

**Detect**: presence of multiple top-level `*.md` files at the project root (beyond a single README.md) that describe architecture or major subsystems.

**Do not recommend for new adoption**. Scatters foundational content across two levels and makes it hard to find. If proposing to migrate such a project, recommend consolidating to Pattern 2 (hybrid).

## Detection procedure

1. List `<Project>/docs/` non-recursively.
2. If `feat/` / `fix/` / `refactor/` / `chore/` dirs are present AND there are `<TopicName>.md` files at top level → **Pattern 2 (hybrid)**.
3. Else if `feat/` / `fix/` / `refactor/` / `chore/` dirs are present alone → **Pattern 1 (change-driven)**.
4. Else if `ADR/` folder is present AND `<Project>_*.md` style files at top level → **Pattern 3 (foundational-first)**.
5. Else if multiple foundational-looking `*.md` files at project root → **Pattern 4 (project-root foundational)**.
6. Else → **no established convention**. Propose Pattern 2 (hybrid) and confirm with user before writing.

## Choosing destination per artifact (within a convention)

Once the project's pattern is known, route extracted artifacts (from step 5 of SKILL.md) thus:

| Artifact type → | Foundational | Change-driven |
|---|---|---|
| Pattern 1 (change-driven) | *no slot* — propose adding top-level `<TopicName>.md` and ask user to ratify | `docs/feat\|fix\|refactor\|chore/<topic>/spec.md` |
| Pattern 2 (hybrid) | `docs/<TopicName>.md` or `docs/ADR/NNN-<decision>.md` | `docs/feat\|fix\|refactor\|chore/<topic>/spec.md` |
| Pattern 3 (foundational-first) | `docs/<Project>_<TopicName>.md` or `docs/ADR/NNN-<decision>.md` | `docs/ADR/NNN-<decision>.md` if sharp; otherwise propose moving change to commit history alone |
| Pattern 4 (project-root foundational) | project-root `<TOPIC>.md` (match existing capitalization style) | `docs/feat\|fix\|refactor\|chore/<topic>/spec.md` |

When the convention has no natural slot for foundational content (Pattern 1), don't silently shoehorn — ask the user whether to extend the project's convention to Pattern 2, or to file the content as an ADR.
