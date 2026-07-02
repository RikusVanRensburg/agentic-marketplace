# Convention detection — paths, slugs, cross-topic scan

This file consolidates the path-resolution and cross-topic-scan rules so `SKILL.md` stays short.

## Path resolution rule

Output lands at `<project-root>/docs/grilled/<topic-slug>/`. `<project-root>` is resolved by walking up from CWD looking for the nearest enclosing folder that contains any of these project markers:

- `*.csproj`, `*.fsproj`, `*.vbproj`
- `package.json`
- `go.mod`
- `Cargo.toml`
- `pyproject.toml`
- `pom.xml`
- `build.gradle`, `build.gradle.kts`

The walk is **bounded by the git root** — never escape the repository. If no marker is found between CWD and the git root, fall back to the git root itself.

Practical effect:
- Grill invoked from inside a sub-project lands in that sub-project's `docs/grilled/`.
- Grill invoked from a flat or marker-less repo lands in the repo-level `docs/grilled/`.

An explicit override is available: `--project-dir /absolute/path` short-circuits the walk and uses the supplied path.

## Slug derivation rule

The topic slug is derived from the user's topic string by:

1. Take the first 50 characters.
2. Lowercase everything.
3. Replace every non-alphanumeric character with `-`.
4. Collapse repeated dashes into one.
5. Trim leading and trailing dashes.

Examples:

| Topic | Slug |
|---|---|
| `Order cancellation` | `order-cancellation` |
| `Payment retry logic (v2)` | `payment-retry-logic-v2` |
| `Document.Versioning -- branches & forks` | `document-versioning-branches-forks` |

If sanitization produces an empty string, the script errors out and the skill must ask the user for a different topic phrasing.

**Confirm the slug with the user before writing anything.** It becomes the folder name; renaming later means moving the folder by hand.

## Running the init script

The script supports two modes: **dry-run** (preview only) and **create** (default). Use dry-run for slug confirmation, then create.

### Two-phase invocation

```bash
# Phase 1: preview the slug-derived path WITHOUT creating anything.
bash "<skill-base-dir>/scripts/init-grill.sh" --dry-run "the topic the user gave you"
```

Show the previewed path to the user. If they reject the slug, ask for a refined topic phrasing and re-run `--dry-run` until they accept.

```bash
# Phase 2: create the folder.
bash "<skill-base-dir>/scripts/init-grill.sh" "the confirmed topic"
```

This second call is the one that does the `mkdir`. The path on stdout is identical between the two phases when the topic string is identical.

### What the script does

- Walks up from CWD using the path-resolution rule above.
- In create mode: ensures `<project-root>/docs/grilled/<topic-slug>/` exists (creating `docs/`, `grilled/`, and the topic folder as needed).
- In dry-run mode: skips the `mkdir` entirely. Still prints the path to stdout.
- **Does not create `adr/` in either mode.** That folder is created lazily by the skill on first ADR write.
- Prints the topic-folder absolute path on stdout in both modes.
- Prints `Grilling target ready: <path>` on stderr in create mode; `Dry-run — would create: <path>` in dry-run mode.

Use the stdout path as the base for every Write call this session — `${path}/CONTEXT.md`, `${path}/adr/NNNN-<slug>.md`, and so on.

If the script exits non-zero, surface the stderr message to the user and stop. Do not fall back to writing into CWD or any other guessed location.

## Cross-topic conflict detection

Once the topic folder is known, scan for cross-topic terminology drift before the interview begins:

1. List every file matching `<project-root>/docs/grilled/*/CONTEXT.md`.
2. Exclude the current topic's own `CONTEXT.md` (if a prior session left one — the current session's terms aren't conflicts with themselves).
3. Parse each file's `## Language` section. For each `**Term**:` heading, extract the term and its definition.
4. Build an in-memory map `term → (other-topic-folder-name, definition)`.

During the interview, whenever a term enters the conversation, check the map. **Do not infer whether meanings match — ask the user explicitly:**

> "`Customer` is already canonized in `payment-retry-logic` as: *'A party that has placed at least one Order.'* Does your usage here match that definition?"

Branch on the answer:

- **Match (user confirms)** — note the match in chat and reuse without re-defining in this topic's `CONTEXT.md`. A brief inline cross-reference (`"same as payment-retry-logic.Customer"`) in any later mention is encouraged.
- **Differ (user clarifies different meaning)** — halt the line of questioning. Show the existing definition verbatim and offer all three options. Per the "always with a recommended answer" rule, propose specific candidates for **Rename**:
  - **Reuse** — adopt the existing definition for this topic too. Write the same definition into this topic's `CONTEXT.md` with a cross-reference in the definition.
  - **Override-with-note** — define the term differently here. The new definition's `_Avoid_` line points at the other topic via `see <other-topic>.<Term>` syntax (see `references/CONTEXT-FORMAT.md` for the format and a worked example).
  - **Rename** — pick a more precise term for this topic. **Propose two candidates** based on the user's stated meaning (e.g. `BillingCustomer` vs `OrderingCustomer`, or `GuestCustomer` vs `RegisteredCustomer`). The user picks one or supplies their own. Add the old term to `_Avoid_`.

The scan is performed **once per session**. Resolution choices are remembered for the rest of the session — the same term doesn't re-prompt within the session.
