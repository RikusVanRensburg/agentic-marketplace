---
name: stack-up
description: Stand up an isolated Timebase stack from the current branch — local processes by default — with Pulse auth and TLS, the shipped Food & Beverage example on both ends and no seed, then prove values actually resolve.
---

# Stand up a stack

One isolated, disposable stack per invocation. It runs **this branch's** binaries, authenticates
against its own Pulse, and comes up carrying the shipped Food & Beverage example — the Collector
Simulator generating the tags the Atlas domain binds to.

The engine is the workspace tool, run from source; this skill decides what to hand it and proves
the result:

```sh
cd Timebase.Wizard/tools/Timebase.Wizard.Workspace
dotnet run --project . -- <verb> --config <the config> ...
```

Its README is the reference for anything below. **Do not** confuse it with `src/Timebase.Wizard`,
the shipped operator tool, which knows none of these verbs.

## 1. The loop being stood up

Simulator → Historian → Connector → Atlas → Explorer, plus Pulse. Every value originates in the
Simulator; nothing is imported from outside.

**Bridge and Postgres are deliberately out of scope.** The component catalog has no Postgres or MQTT
container, and no shipped content configures a Bridge egress — that is separate work, not something
to improvise here.

## 2. Layout and identity

- Root: the folder the caller names, else **`D:\test`**.
- Subfolder by target: **`local\`** or **`docker\`**.
- Stack id: **`timebase_<4 hex>`**, the first 4 hex characters of a fresh GUID. It is also the
  stack's name and, for Docker, its compose project name (`--project`).
- So: `D:\test\local\timebase_9f3c\`.

Mint the id, then **check the folder does not exist and re-mint if it does** — 4 hex digits is
65,536 values, and a collision would tear down someone else's stack.

**Always pass `--workspace-dir` explicitly.** Its default is `.workspace` beside the config file, so
two configs in one directory silently share one workspace and their content accumulates into the
same Atlas.

For `--target local` every directory a component uses lives under that folder — settings, config,
data, logs, certificates — with logs at `<stack>/logs/<service>.log` and `processes.json` recording
exactly what was started so `down` stops precisely those processes. Nothing touches `%ProgramData%`
and no Windows service is registered. For `--target docker` the folder holds the generated compose,
`.env` and plan, but the data lives in **named Docker volumes**, not under the folder.

## 3. Binaries: run this branch, not the installed Timebase

`--bin` defaults to *beside the Wizard*, i.e. whatever is installed on the machine. That is the
wrong answer when the point is to test a branch, so build and assemble one:

1. **Build per csproj, never the `.slnx`** — a green solution build can skip the host project
   entirely and report success:

   ```sh
   dotnet build Timebase.<Host>/src/Timebase.<Host>/Timebase.<Host>.csproj -c Debug
   ```

2. Assemble `<root>\bin\<branch-slug>\<InstallFolder>` — the install's one-folder-per-component
   layout, which `LocalOrchestrator` looks for first. `InstallFolder` is `Pulse`, `Historian`,
   `Collector`, `Connector`, `Atlas`, `Explorer`, `Bridge`; the executable is
   `Timebase.<Host>.exe`.

   **Junction each folder to the build output** rather than publishing into it:

   ```powershell
   New-Item -ItemType Junction -Path "<bin>\<InstallFolder>" `
            -Target "<repo>\Timebase.<Host>\src\Timebase.<Host>\bin\Debug\net10.0"
   ```

   Two reasons: a rebuild is then live with no re-copy, and publish output has its own traps — a
   host's `Plugins/<Provider>/` folder can carry framework-family DLLs that refuse to load when the
   installed framework outruns the package pins.

   A **flat** `<bin>\Timebase.<Host>.exe` layout is also accepted as a fallback, but do not build
   one: seven hosts' dependencies in one folder collide.

3. Pass `--bin <root>\bin\<branch-slug>`. Report which branch the binaries came from — a stack
   silently running the installed build is the failure this step exists to prevent.

## 4. The workspace file

Minimal, and everything unstated is defaulted. `plan` resolves it and prints what would happen
without changing anything — run that first:

```json
{
  "workspace": { "name": "timebase_9f3c" },
  "components": {
    "cmp_pulse":     { "name": "Pulse",     "type": "Timebase.Pulse" },
    "cmp_hist":      { "name": "Historian", "type": "Timebase.Historian" },
    "cmp_collector": { "name": "Collector", "type": "Timebase.Collector" },
    "cmp_connector": { "name": "Connector", "type": "Timebase.Connector" },
    "cmp_atlas":     { "name": "Atlas",     "type": "Timebase.Atlas" },
    "cmp_explorer":  { "name": "Explorer",  "type": "Timebase.Explorer" }
  }
}
```

Write it inside the stack folder, so the stack is one deletable thing.

**Ports.** A port stated explicitly in the config is left exactly as written; `--port-offset N`
shifts every defaulted port. Take the caller's ports when given. Otherwise pick a **free block** and
say which: the installed Windows services hold 4511–4542, and a `+20000` block is frequently
occupied by a Docker workspace already running on this machine. Check before choosing — `up`
refuses to start rather than binding around a taken port, which is the correct behaviour and a
slow way to discover the collision.

## 5. Auth, TLS and certificates

Always `--auth pulse --certs pulse`: Pulse is the identity provider and the certificate authority.
The tool already handles the ordering that cannot be got wrong — Pulse boots alone so its generated
secrets can be read back, and every component restarts once after CA enrolment because .NET caches
the trust decision.

- The stack's client secrets land in `<stack>/.env` as `<CLIENT>_CLIENT_SECRET`. Real secrets:
  never commit or paste them.
- **A CA shared by every stack is not supported today.** Each workspace's Pulse is its own CA, so
  each stack has its own root. Say so rather than implying otherwise.
- Trusting that CA in the machine store is a machine-level change: **ask before importing it**, and
  say what breaks without it — a browser login against the stack fails in ways that read like a
  server error rather than a trust error.

## 6. Up

```sh
dotnet run --project . -- up --config <stack>/workspace.config \
  --target local --workspace-dir <stack> --bin <bin> --auth pulse --certs pulse [--port-offset N]
```

No `--seed`. The content comes next, from what the products ship.

## 7. Content — three steps, and all three must agree

The binding path `historian-foodbeverage/Food Beverage/120-LT-001.PV` has three segments owned by
three different components. Get one wrong and the domain still compiles, every host stays healthy,
and every value resolves to nothing — **quality is the only thing that tells the two apart.**

1. **Collector — select the Food & Beverage example.** The shipped Simulator instance defaults to
   the annotated `juice-factory` example, so it has to be pointed at the other one. The example body
   comes from the host's own API:

   ```
   GET /app/plugins/Simulator/examples/food-beverage
   ```

   then write it onto the Simulator collector record through the reset route. Confirm the exact
   route from the running host's API surface rather than assuming its shape.

2. **Atlas — commission the `foodbeverage` example.** Atlas's examples are opt-in content under
   `examples/`, discovered by `ExampleCatalog`; nothing is a live domain until imported:

   ```
   GET  /app/commissioning          # marker state and the selectable examples
   POST /app/commissioning/import   # additive import of the selected examples
   ```

3. **Connector — create the datasource alias `historian-foodbeverage`**, pointing at this
   workspace's Historian. Nothing ships this alias; it is the first segment of all 176 bound
   properties.

Calling these needs a token: `client_credentials` against Pulse's `/auth/token`, form-encoded, with
the secret from `<stack>/.env`. **Audience decides acceptance** — each host validates against its own
client id, and a client only carries the audiences Pulse seeded it with (Connector carries `Atlas`
but not `Historian`). The wrong client gives a 401 that reads exactly like a bad secret.

## 8. Prove it

```sh
dotnet run --project . -- verify --config <stack>/workspace.config
dotnet run --project . -- verify --config <stack>/workspace.config --expect-values foodbeverage/<instance>
```

`verify` checks behaviour, not liveness: every client can obtain a token, an anonymous caller is
actually refused (a 200 is reported as a failure), each web surface is served, and the Connector
really reached Atlas.

`--expect-values` requires **every** value on the named instance to come back quality **Good**, so
pick an instance whose properties are all mapped. `GoodNoData` means bound correctly to a tag
nothing has written — content to extend, not wiring to fix. Report which instance you proved.

## 9. Report

- The stack id, its folder, the target, and the branch its binaries came from.
- Every host's URL, and which ports were chosen if they were not the caller's.
- That secrets live in `<stack>/.env`, and whether the CA was imported.
- The verification result, naming the instance whose values came back Good.
- How to change or remove it: `stack-update`, `stack-down`.

## Done when

- [ ] The id was minted, checked for collision, and used as the folder name and stack name.
- [ ] `--workspace-dir` was passed explicitly, so nothing landed in a shared `.workspace`.
- [ ] `--bin` pointed at this branch's build, assembled per csproj — and the branch was reported.
- [ ] Ports were verified free before `up`, not discovered by its refusal.
- [ ] `--auth pulse --certs pulse`, with the CA import asked for rather than assumed.
- [ ] No seed was applied; all three content steps were done against the running stack.
- [ ] `verify` passed, and `--expect-values` proved Good quality on a named, fully-mapped instance.
