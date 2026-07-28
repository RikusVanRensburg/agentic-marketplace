# Logic Prototype

A tiny interactive terminal app that lets the user **press buttons and watch state change**. Use this when the question is about business logic, state transitions, or data shape — the kind of thing that looks reasonable on paper but only feels wrong once you push it through real cases.

## Core and shell

Every logic prototype has two halves, and the rest of this file turns on the split:

- The **core** — the logic that answers the question. Pure, and shaped so it can be lifted into the real codebase on its own.
- The **shell** — the terminal app wrapped around it. Throwaway, driven by hand, never shipped.

The shell imports the core and calls into it; nothing flows the other direction.

## Process

### 1. State the question

Before writing code, write down what state model and what question you are prototyping. One paragraph, in the prototype's README or a comment at the top of the file. A logic prototype that answers the wrong question is pure waste — make the question explicit so it can be checked later, whether the user is watching now or returning to it AFK.

### 2. Pick the language

Whatever the host project uses, with the project's existing tooling — a prototype is no place for a new package manager or runtime. If the project has no obvious runtime (e.g. a docs repo), ask.

### 3. Shape the core

Pick the shape that fits the question, *not* whichever is easiest to wire to a shell:

- **A pure reducer** — `(state, action) => state`. Good when actions are discrete events and state is a single value.
- **A state machine** — explicit states and transitions. Good when "which actions are even legal right now" is part of the question.
- **A small set of pure functions** over a plain data type. Good when there's no implicit current state — just transformations.
- **A class or module with a clear method surface** when the logic genuinely owns ongoing internal state.

Keep the core pure: state lives in memory, and the only thing crossing its interface is data. Persistence is something a prototype **checks**, never something it depends on; when the question is itself about persistence, point the core at a scratch DB or local file named so it reads as disposable (`PROTOTYPE — wipe me`).

### 4. Build the smallest shell that exposes the state

Keep the shell light — on every tick, clear the screen (`console.clear()` / `print("\033[2J\033[H")` / equivalent) and re-render the whole frame. The user should always see one stable view, not an ever-growing scrollback.

Each frame has two parts, in this order:

1. **Current state**, pretty-printed and diff-friendly (one field per line, or formatted JSON). Use **bold** for field names or section headers and **dim** for less important context (timestamps, IDs, derived values). Native ANSI escape codes are fine — `\x1b[1m` bold, `\x1b[2m` dim, `\x1b[0m` reset. Reach for a styling library only if the project already has one.
2. **Keyboard shortcuts**, listed at the bottom: `[a] add user  [d] delete user  [t] tick clock  [q] quit`. Bold the key, dim the description, or vice-versa — whatever reads cleanly.

Behaviour:

1. **Initialise state** — a single in-memory object/struct. Render the first frame on start.
2. **Read one keystroke (or one line)** at a time, dispatch to a handler that calls into the core.
3. **Re-render** the full frame after every action, so the user sees the whole state change — replace, don't append.
4. **Loop until quit.**

The whole frame should fit on one screen. Terminal code, prompts, and `console.log` all live here, in the shell.

### 5. Make it runnable in one command

Add a script to the project's existing task runner (`package.json` scripts, `Makefile`, `justfile`, `pyproject.toml`). The user runs `pnpm run <prototype-name>` or equivalent, and never needs to remember a path.

If the host project has no task runner, put the command at the top of the prototype's README.

### 6. Hand over

Hand over the way [SKILL.md](SKILL.md) describes — for this branch, "how to reach it" is the run command.

The user drives it themselves. The interesting moments are when they say "wait, that shouldn't be possible" or "huh, I assumed X would be different" — those are the bugs in the _idea_, which is the whole point. If they want new actions added, add them; prototypes evolve.

When the verdict lands, capture splits along the same seam: the validated core lifts into the real module on its own, and everything else — the shell included — stays on the throwaway branch as the primary source.
