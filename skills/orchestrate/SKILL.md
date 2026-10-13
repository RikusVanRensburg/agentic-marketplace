---
name: orchestrate
description: Pre-flight for the orchestrator mod. Turns a GitHub PRD with sub-issues, or a plain plan, into a launch plan, settles every question with the person, then launches an unattended run of dev and isolated QA agents per slice. Use when the person wants a multi-issue plan or a PRD implemented by the orchestrator.
disable-model-invocation: true
---

# Orchestrate

You prepare a run and launch it. From launch on, the orchestrator mod drives everything in code: worktrees, agents, the ladders, QA, merges, verification, the tracker. Nobody answers questions mid-run, so every ambiguity is settled here, with the person.

## 1. Read the whole plan

- **GitHub:** the PRD issue and all its comments, then every sub-issue with all its comments and acceptance criteria (`gh issue view <n> --comments`). A PRD with no sub-issues cannot run: say so and stop.
- **Plain plan:** the text the person gave. Split it into slices, each with its own body and checkable acceptance criteria, and agree the split with the person.

## 2. Build the graph

Dependencies, in priority order: an explicit "Blocked by", then the order the plan lists slices, then issue number. Keep only edges that are real: a wrong edge serialises work for nothing, a missing one merges work onto code that is not there yet. The mod refuses unknown deps, cycles and duplicate ids, but only you can tell whether an edge is real.

Slices that change the same files and have no edge between them start from the same base, so the second to merge conflicts. The mod refuses a plan where two briefs name the same files with no edge between them. Add the edge, or set `allowOverlap: true` when they must run side by side; a conflict then goes to the resolve agent.

## 3. Pick each slice's mode

- **haiku-first** only when you can name the exact files and symbols, the work is mechanical, and you can write every field of the brief below without guessing.
- **sonnet-first** for anything that needs design judgment, touches code you cannot pin down, or spans several modules.

When unsure, sonnet-first: a haiku attempt that QA rejects costs more than starting on sonnet (ADR 0005).

A haiku-first slice needs a brief, and the mod refuses the launch if any field is empty:

- `goal`: one sentence
- `inScope.files`, `inScope.symbols`: exact paths and names
- `outOfScope`: what to leave alone
- `acceptance`: checkable statements
- `commands.build`, `commands.test`: the exact commands
- `done`: the definition of done
- `returns`: what the report must say

A sonnet-first slice may carry a brief too; it goes into every dev prompt.

## 4. Repos, base and branches

- Each repo: `root` (the folder holding `.bare`, from `git rev-parse --git-common-dir`), `base` (the branch the run builds on; for stacked work the branch of the worktree the person is in, or the one they name), and the exact `build` and `test` commands. The mod runs them on the integration branch before anything merges and refuses to start on a red base.
- Branch names follow the repo's own rule first: a CI regex under `.github/workflows`, else `CONTRIBUTING.md`, `CLAUDE.md` or `docs/agents/branches.md`. Without one, the mod's shape applies: integration `<type>/<INITIALS>/<slug>`, slices `<type>/<INITIALS>/orchestration/<slug>/<id>-<slice-slug>`. If the repo's rule rejects that shape, set `integrationBranch` and each slice's `branch` to names it accepts. The integration branch must never sit under `orchestration/`.
- If the integration branch already has a worktree the mod did not create, it stops and asks; settle that now.

## 5. Grill to zero

Ask about everything an agent would otherwise guess: unclear criteria, conflicting requirements, missing credentials or services, edges you are unsure of. Bold each question.

## 6. Present and launch

Show the person the graph, each slice's mode and starting rung, the branches, the base per repo, and the build and test commands. Their go is the only gate. Then call `mcp__orchestrator__launch` with `{ plan }`:

```json
{
  "title": "Payments",
  "slug": "payments",
  "type": "feat",
  "initials": "RVR",
  "source": { "kind": "github", "parent": "https://github.com/flow-software/timebase/issues/100" },
  "repos": {
    "timebase": { "root": "D:/src/flow/timebase", "base": "dev", "commands": { "build": "dotnet build", "test": "dotnet test" } }
  },
  "slices": [
    { "id": "107", "title": "Core DTO", "slug": "core-dto", "repo": "timebase", "deps": [], "mode": "haiku-first", "brief": { "goal": "...", "inScope": { "files": ["..."], "symbols": ["..."] }, "outOfScope": [], "acceptance": ["..."], "commands": { "build": "dotnet build", "test": "dotnet test" }, "done": "...", "returns": "..." } },
    { "id": "108", "title": "Endpoint", "slug": "endpoint", "repo": "timebase", "deps": ["107"], "mode": "sonnet-first" }
  ]
}
```

A plain plan uses `"source": { "kind": "plain", "text": "<the plan>" }`, short ids such as `t1`, and a `body` on every slice. A refusal lists every problem; fix them and call again. Nothing starts until the plan is clean.

## During the run

- The pane (`/orchestrator pane`) and the band above the prompt show progress. `orchestrator_status` gives you the same as text.
- A merge conflict first goes to a resolve agent, which merges the integration branch into the slice keeping both sides' acceptance criteria; fresh QA then checks the slice and the slices it collided with. If the two slices' requirements contradict, it stops and that becomes a blocker.
- A blocker arrives as a message while the rest of the run continues. Ask the person, then hand the answer back: `/orchestrator retry <slice | final:<repo> | integration:<repo>> <answer>`. The slice resumes on the rung it stopped on, with the answer in its prompt.
- `/orchestrator abort` stops new work; `/orchestrator take` moves a run to this session.

## After the run

The run ends at a verified local integration branch, with issues closed as their slices merged. Nothing is pushed. Summarise from `orchestrator_status`. Push and PR only on the person's yes, and then through the worktree-lifecycle mod's ship, which waits for their press.
