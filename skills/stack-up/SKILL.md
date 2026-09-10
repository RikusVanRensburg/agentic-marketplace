---
name: stack-up
description: Stand up an isolated Timebase stack from the current branch — local processes by default — with Pulse auth and TLS, the shipped Food & Beverage example wired end to end with no seed, then prove values resolve with quality Good.
---

# Stand up a stack

One isolated, disposable stack per invocation. It runs **this branch's** binaries, authenticates
against its own Pulse, and comes up carrying the shipped Food & Beverage example — the Collector
Simulator generating the tags the Atlas domain binds to.

The engine is the workspace tool, run from source; this skill decides what to hand it and proves
the result:

```sh
cd Timebase.Wizard/tools/Timebase.Wizard.Workspace
dotnet run --project . -- <verb> --config <stack>/workspace.config --workspace-dir <stack> ...
```

Its README is the reference and `<verb> --help` documents each option. **Do not** confuse it with
`src/Timebase.Wizard`, the shipped operator tool, which knows none of these verbs.

Two of its defaults are the opposite of what this skill wants, so both flags are always explicit:

- **`--target` defaults to `docker`.** Pass `--target local`.
- **`--workspace-dir` defaults to `.workspace` beside the config file**, and `verify`, `down` and
  `capture` resolve it the same way. Every verb gets `--workspace-dir <stack>`, not only `up` —
  omit it on `down` and the tool answers "No rendered workspace at …\.workspace; nothing to stop."

## 1. The loop being stood up

Simulator → Historian → Connector → Atlas, plus Pulse, plus Explorer as a web surface. Every value
originates in the Simulator; nothing is imported from outside.

**Bridge and Postgres are deliberately out of scope.** The component catalog
(`Timebase.Wizard/src/Timebase.Wizard.Components/ComponentCatalog.cs`) has no Postgres or MQTT
entry, and no shipped content configures a Bridge egress.

**Explorer's shipped sources point at an installed Timebase's default ports** (`sources.config`:
Historian `localhost:4512`, Atlas `localhost:4552`). `verify` only checks that Explorer serves;
re-pointing its sources at this stack is not part of this skill. Say so in the report.

## 2. Layout and identity

- Root: the folder the caller names, else **`D:\test`**.
- Subfolder by target: **`local\`** or **`docker\`**.
- Stack id: **`timebase_<4 hex>`**, the first 4 hex characters of a fresh GUID. It is also the
  workspace name and, for Docker, its compose project name (`--project <id>`).
- So: `D:\test\local\timebase_9f3c\`.

Mint the id, then **check the folder does not exist and re-mint if it does** — 4 hex digits is
65,536 values, and a collision would tear down someone else's stack.

For `--target local` every directory a component uses lives under that folder: each component's five
roots at `<stack>/<service>/{Config,Data,Settings,Logs,Certificates}` (service names are lower-case:
`pulse`, `historian`, `collector`, `connector`, `atlas`, `explorer`), stdout at
`<stack>/logs/<service>.log`, and `processes.json` recording exactly what was started so `down`
stops precisely those processes. Nothing touches `%ProgramData%` and no Windows service is
registered. For `--target docker` the folder holds the generated compose, `.env` and plan, but the
data lives in **named Docker volumes** (`<service>:/<service>`), not under the folder.

**Record what the tool does not.** `workspace-plan.json` carries the name, auth, certs, ports and
components; `.env` the secrets; `processes.json` the pids. None of them records `--bin`, the branch
or the worktree. Write `<stack>/rr-stack.json` before `up`, and keep it current:

```json
{
  "branch": "feat/RVR-x", "worktree": "D:\\src\\timebase\\feat\\RVR-x", "commit": "<sha>",
  "target": "local", "bin": "D:\\test\\bin\\feat-RVR-x", "portOffset": 20000,
  "up": "<the exact up command line>", "expectValues": "foodbeverage/FB-BT-001"
}
```

`stack-update`, `stack-down` and `work-refresh` read it.

## 3. Binaries: run this branch, not the installed Timebase

**`--bin` has no usable default when the tool runs from source.** `DefaultBinaryDirectory` walks up
from the tool's own build output looking for a component and finds none, so the default is a folder
under `tools/Timebase.Wizard.Workspace/bin` holding nothing, and `up` fails with
"'…\Timebase.Atlas.exe' does not exist". It resolves to the installed Timebase only when the tool is
run from an install. Always pass `--bin`.

1. **Build per csproj, never the `.slnx`** — Explorer's solution disables all of Explorer's own
   projects in a Debug build and still reports success (`docs/agents/testing.md`):

   ```sh
   dotnet build Timebase.<Host>/src/Timebase.<Host>/Timebase.<Host>.csproj -c Debug
   ```

   The output (`bin/Debug/net10.0/`) carries the host exe, its plugins (`Plugins/Simulator`,
   `Plugins/Historian`, … — `CopyPluginOutputs` runs on every build) and Atlas's `examples/`.

2. **Stage the SPA — the build does not.** `wwwroot/` is produced only by the publish target
   (`PublishRunWebpack`), and every host ends its pipeline with `MapFallbackToFile("index.html")`,
   so a host without `wwwroot/index.html` answers `GET /` with 404 and `verify`'s "serves" check
   fails for every host. Once per host, after the dotnet build (which regenerates the gitignored
   `contract.ts` / `version.generated.ts` the UI imports):

   ```powershell
   pnpm install --prefer-offline                                   # once, repo root; npm cannot resolve the link: dependency
   pnpm --dir Timebase.<Host>/src/Timebase.<Host>.UI run build     # tsc -b && vite build -> dist/
   Copy-Item -Recurse -Force "Timebase.<Host>/src/Timebase.<Host>.UI/dist/*" `
             "Timebase.<Host>/src/Timebase.<Host>/bin/Debug/net10.0/wwwroot/"
   ```

   `dotnet build` does not clean `wwwroot/`, so a later rebuild keeps it; redo the copy when UI code
   changed.

3. **Assemble `<root>\bin\<branch-slug>\<InstallFolder>`** — the install's one-folder-per-component
   layout, which `LocalOrchestrator` looks for first. `InstallFolder` is `Pulse`, `Historian`,
   `Collector`, `Connector`, `Atlas`, `Explorer`, `Bridge`; the executable is `Timebase.<Host>.exe`.
   **Junction each folder to the build output** rather than publishing into it:

   ```powershell
   New-Item -ItemType Junction -Path "<bin>\<InstallFolder>" `
            -Target "<repo>\Timebase.<Host>\src\Timebase.<Host>\bin\Debug\net10.0"
   ```

   A rebuild is then live with no re-copy, and publish output's own trap is avoided — a host's
   `Plugins/<Provider>/` can carry framework-family DLLs that refuse to load when the installed
   framework outruns the package pins. A **flat** `<bin>\Timebase.<Host>.exe` layout is accepted as
   a fallback, but do not build one: six hosts' dependencies in one folder collide.

4. Pass `--bin <root>\bin\<branch-slug>`. Report which branch and commit the binaries came from — a
   stack silently running the installed build is the failure this step exists to prevent.

## 4. The workspace file

Minimal, and everything unstated is defaulted. `plan` resolves it and prints what would happen
without changing anything — run that first, with the same `--port-offset`:

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

Write it inside the stack folder as `workspace.config`, so the stack is one deletable thing.

**Ports.** Defaults are `45x1` HTTP / `45x2` HTTPS per host (`list` prints them; Historian 4511/12,
Collector 4521/22, Explorer 4531/32, Pulse 4541/42, Atlas 4551/52, Connector 4561/62). A port
stated explicitly in the config is left exactly as written; `--port-offset N` shifts every
defaulted one. Take the caller's ports when given. Otherwise pick a **free block** and say which:
an installed Timebase holds the defaults, and `+20000` is frequently taken by a Docker workspace
already running on this machine. Check with `Get-NetTCPConnection -State Listen` before choosing —
`up` refuses to start rather than binding around a taken port, which is correct and a slow way to
discover the collision.

## 5. Auth, TLS and certificates

Always `--auth pulse --certs pulse`: Pulse is the identity provider and the certificate authority.
The tool already handles the ordering that cannot be got wrong — Pulse boots alone so its generated
secrets can be read back, and every component restarts once after CA enrolment because .NET caches
the trust decision.

- The stack's client secrets land in `<stack>/.env` as `<CLIENT>_CLIENT_SECRET`
  (`HISTORIAN_`, `COLLECTOR_`, `CONNECTOR_`, `ATLAS_`, `EXPLORER_`; Pulse has no client). Real
  secrets: never commit or paste them.
- **A CA shared by every stack is not supported today.** Each workspace's Pulse is its own CA, so
  each stack has its own root. Say so rather than implying otherwise.
- Trusting that CA in the machine store is a machine-level change: **never import it from this
  skill.** Report where it is and what breaks without it — a browser login against the stack fails
  in ways that read like a server error rather than a trust error. The API calls below and
  `verify` skip certificate validation and need no trust.

## 6. Pre-seed the Atlas domain — before `up`

The obvious route is closed: `POST /app/commissioning/import` is admin-gated
(`AppAuthGate.RequireAdmin` → role `pulse:administrator`), Pulse issues that role only to a signed-in
user (`authorization_code` / `refresh_token`; `CreateTokenCommandHandler`: "client_credentials
clients are never administrators"), and no `/api` import exists. So put the files where the import
would (`CommissioningService.CopyDomainExampleInto` / `CopyRequiredLibraryInto`) **before Atlas's
first boot**, which commits whatever it finds in its Config root ("Created initial commit with
existing content", `AtlasStartupGit`):

```powershell
$ex  = "<repo>/Timebase.Atlas/src/Timebase.Atlas/examples"
$cfg = "<stack>/atlas/Config"
New-Item -ItemType Directory -Force "$cfg/domains/foodbeverage", "$cfg/libraries" | Out-Null
Copy-Item -Recurse "$ex/Food & Beverage/foodbeverage/*" "$cfg/domains/foodbeverage/"
Remove-Item "$cfg/domains/foodbeverage/example.json"          # descriptor, not content
```

Then, for every `../../libraries/<lib>.jsonld` in the domain's `@context` (read the list from
`ontology.jsonld`; do not hard-code it) **except `atlas-core` and `atlas-common`**, which Atlas seeds
itself, copy the file to `$cfg/libraries/<lib>.jsonld` — from the pool `$ex/libraries/<lib>.jsonld`,
or, for a library that is itself an example (`isa88-batch`, `packml`), from
`$ex/<Vertical>/<lib>/<lib>.jsonld` (both live under `Enterprise & Batch`). The relative depth is the
same in both trees, so the `@context` paths resolve unchanged.

Nothing compiles it yet — that is step 8C, after its datasource exists.

## 7. Up

```sh
dotnet run --project . -- up --config <stack>/workspace.config --target local --workspace-dir <stack> \
  --bin <bin> --auth pulse --certs pulse --port-offset N
```

No `--seed`. Record the exact command line in `rr-stack.json`. Any host that never listens: its
log is `<stack>/logs/<service>.log`; a first start is slower than a restart because each component
enrols its certificate.

## 8. Wire the content — three components, and all three must agree

The binding path `historian-foodbeverage/Food Beverage/120-LT-001.PV` has three segments owned by
three different components: the Connector instance's **alias**, the Historian **dataset** the
Collector writes into (the Historian plugin advertises `{alias}/{Dataset}/[Tag:string]`), and the
**tag name** the Simulator generates. Get one wrong and the domain still compiles, every host stays
healthy, and every value resolves to nothing — **quality is the only thing that tells the two
apart.**

Nothing ships wired: without a seed the tool's own `CollectorHistorianWiring` and `ConnectorWiring`
do nothing, and the shipped configs point at an installed Timebase's default ports with auth off.

**Tokens.** `POST https://localhost:<pulse https>/auth/token`, form-encoded,
`grant_type=client_credentials&client_id=<Id>&client_secret=<from .env>`. Pulse stamps `aud` with the
client's **own id first**, then its seeded audiences (`Pulse.cs`: Historian → Pulse; Collector →
Pulse, Historian; Atlas → Pulse, Historian; Connector → Pulse, Atlas; Explorer → Pulse, Historian,
Atlas), and every host validates `aud` against its own client id. So **a host's `/api` plane takes
that host's own client token** — Collector's for `/api/collectors`, Connector's for
`/api/connectors`, Atlas's for `/api/v1`. The wrong client gives a 401 that reads exactly like a bad
secret. The `/app` plane is the UI's: its mutations need an administrator, which a client token
never is — do not use it.

**A. Collector** (`COLLECTOR_CLIENT_SECRET`). Read the ids from `GET /api/collectors` and
`GET /api/historians` rather than assuming them; the shipped template has collector `col_5107a1`
(type `Simulator`) writing to historian `hst_4f2a91`.

1. Point the historian record at this stack's Historian, with the Collector's own credentials —
   its token carries `aud: Historian`:

   ```
   PUT /api/historians/hst_4f2a91
   { "name": "Local", "host": "localhost", "port": <historian https>, "useTls": true,
     "auth": { "enabled": true, "idP": { "host": "localhost", "port": <pulse https>, "useTls": true },
               "clientId": "Collector", "clientSecret": "<COLLECTOR_CLIENT_SECRET>" } }
   ```

2. Name the dataset — the shipped link says `default`, which the domain never mentions:

   ```
   PUT /api/collectors/col_5107a1/historians
   { "historians": [ { "id": "hst_4f2a91", "dataset": "Food Beverage" } ] }
   ```

3. Select the Food & Beverage example. The body is the file itself —
   `Timebase.Collector/src/Timebase.Collector.Simulator/Example/FoodBeverage.settings.config`, JSONC
   under a `Settings` wrapper, both of which `SaveInstanceSettingsAsync` accepts:

   ```
   PUT /api/collectors/col_5107a1/settings   (raw file contents)
   ```

   (`GET /app/plugins/Simulator/examples/food-beverage` returns the same text, behind a UI session;
   the file needs none.) The config hot-reloads, and the example backfills seven days, so data
   exists at once.

**B. Connector** (`CONNECTOR_CLIENT_SECRET`).

1. Point the Atlas link at this stack — the shipped `atl_7c3e18` says `localhost:4551`, plain HTTP:

   ```
   PUT /api/atlases/atl_7c3e18
   { "name": "Primary", "host": "localhost", "port": <atlas https>, "useTls": true, "reconnectDelaySeconds": 5 }
   ```

2. Create the datasource. The alias is settable **only at creation** and is the binding path's first
   segment:

   ```
   POST /api/connectors
   { "defaultType": "Timebase.Historian", "name": "historian-foodbeverage", "alias": "historian-foodbeverage" }
   ```

   The response carries the host-minted `id` — read it, do not guess it.

3. Give it the Historian and the dataset. The read hop needs a client whose token carries
   `aud: Historian`: Collector, Atlas or Explorer do; **the Connector's own does not** (Pulse seeds it
   `Pulse, Atlas`). Use the Collector's — it is provisioned for exactly this hop. (The tool's seed
   path, `ConnectorWiring`, hands this hop the Connector's own client, which the Historian's audience
   rule would refuse; treat that as a defect to raise, not a precedent.)

   ```
   PUT /api/connectors/<id>/settings
   { "Host": "localhost", "Port": <historian https>, "UseTls": true,
     "ClientName": "Timebase.Connector.Historian", "DefaultLookback": "01:00:00",
     "Auth": { "Enabled": true, "ClientId": "Collector", "ClientSecret": "<COLLECTOR_CLIENT_SECRET>",
               "IdP": { "Host": "localhost", "Port": <pulse https>, "UseTls": true } },
     "Datasets": { "Food Beverage": { "Dataset": "Food Beverage", "Filter": "" } } }
   ```

   The `Filter` shapes only the catalog rowset; the per-tag template the bound properties resolve
   through is emitted once per distinct `Dataset` and ignores it.

4. Confirm with `GET /api/connectors` that the instance is enabled and running, and
   `GET /status` on the Connector reports `connectionState: Connected`. The shipped
   `con_a1c4f7` (`historian-juice-factory`) points at an installed Historian and will sit unhealthy —
   `DELETE /api/connectors/con_a1c4f7` so it does not muddy the picture. The machine plane's routes
   are `Timebase.Connector/src/Timebase.Connector/Connector/ConnectorEndpoints.*.cs`; read them for
   any shape not stated here.

**C. Atlas** (`ATLAS_CLIENT_SECRET`) — compile the pre-seeded domain, **after** B reports Connected;
a domain compiled before its datasource is advertised resolves nothing:

```
PUT /api/v1/branches/main/domains/foodbeverage/world
```

A 200 whose body carries a non-empty `violations` array is a **failed** compile
(`AtlasDomainCompiler`). Once compiled, a restart recompiles it automatically
(`AutoRecompileOnStartup`, deferring connector-dependent domains until their connector is back) — so
this is a first-boot step, not a per-restart one.

## 9. Prove it

```sh
dotnet run --project . -- verify --config <stack>/workspace.config --workspace-dir <stack>
dotnet run --project . -- verify --config <stack>/workspace.config --workspace-dir <stack> \
  --expect-values foodbeverage/FB-BT-001
```

`verify` checks behaviour, not liveness: every client can obtain a token, an anonymous caller is
actually refused (a 200 is reported as a failure), each web surface answers `GET /` with 200/302,
and the Connector reports `Connected`. It waits up to six minutes for each surface — Atlas
recompiles before it serves.

`--expect-values <domain>/<instance>` reads
`/api/v1/branches/main/domains/<domain>/instances/<instance>/values` and requires **every** item's
`quality` to be `Good`. Instance ids are the `id` fields in `domains/foodbeverage/instances/*.map.json`
(`FB-BT-001` is Blend Tank 1; every one of the example's 176 bound properties carries the
`historian-foodbeverage/Food Beverage/` prefix). Anything not `Good` fails; a quality that means
bound-but-nothing-written is a tag the Simulator has not produced yet — content, not wiring. Report
which instance you proved, and record it in `rr-stack.json`.

## 10. Report

- The stack id, its folder, the target, and the branch and commit its binaries came from.
- Every host's URL, and which ports were chosen if they were not the caller's.
- That secrets live in `<stack>/.env`, that the CA was **not** imported, and where it is.
- The verification result, naming the instance whose values came back Good.
- That Explorer's shipped sources were not re-pointed.
- How to change or remove it: `stack-update`, `stack-down`.

## Done when

- [ ] The id was minted, checked for collision, and used as the folder name and workspace name.
- [ ] `--target local` and `--workspace-dir` were passed on every verb, so nothing landed in a
      `.workspace` and no verb re-derived the plan.
- [ ] `--bin` pointed at this branch's build, assembled per csproj with the SPA staged — and the
      branch and commit were reported and recorded in `rr-stack.json`.
- [ ] Ports were verified free before `up`, not discovered by its refusal.
- [ ] `--auth pulse --certs pulse`, and the CA was left out of the machine store.
- [ ] No seed was applied; the domain was pre-seeded, and all three wiring steps ran against the
      running stack through the `/api` planes with each host's own client.
- [ ] `verify` passed, and `--expect-values` proved Good quality on a named instance.
