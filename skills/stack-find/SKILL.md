---
name: stack-find
description: Find the Timebase backends that are already running — containers and host processes — and resolve one named host to the URL a client should talk to. Read-only survey in a forked subagent; it never starts, stops or reconfigures anything, and returns a table.
context: fork
agent: Explore
---

# Find a running backend

Report what is **already up**, and resolve the caller's host to one URL. This skill starts nothing,
stops nothing, and changes no configuration. If what the caller needs is not running, say so and
stop — that is an answer, not a failure to work around.

It runs forked, on a read-only agent, so the port scans and process listings stay out of the
caller's context. A fork cannot ask: where §4 would have put a choice to the user, it puts every
candidate in the returned table and stops, and the caller asks. The host to resolve, if any, arrives
in the arguments.

## 1. Containers first — they claim ports that look like host processes

```sh
docker ps --format '{{.Names}} | {{.Ports}} | {{.Status}}'
```

- Container names are `<project>-<service>-1`. The project is the stack id when the stack was
  brought up with `--project <id>` (what `stack-up` does); otherwise the workspace tool derives
  `timebase-<workspace name, slugged>` (`ComposeGenerator.DefaultProjectName`). The service is the
  lower-case host name (`pulse`, `historian`, `collector`, `connector`, `atlas`, `explorer`, `bridge`).
- Each host container publishes an HTTP/HTTPS pair (`45x1`/`45x2` plus the offset); the **higher**
  port of the pair is HTTPS. Inside the compose network the hosts still talk on the unshifted ports.
- A stack does not necessarily run every host — a missing container is a fact to report, not a
  reason to look harder.

Do this step first because of what it rules out: on Windows a published container port is owned by
`com.docker.backend.exe` / `wslrelay.exe`, so it appears in a listening-port scan as an ordinary
listener with no Timebase process behind it. **A container stack can also be published on exactly
the ports a host-run instance would use.** Subtract every published port here before reading
anything into step 2.

## 2. Host processes — identify by the process, never by the port

```powershell
Get-NetTCPConnection -State Listen | ForEach-Object {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"
  [pscustomobject]@{ Port = $_.LocalPort; Name = $p.Name; Cmd = $p.CommandLine }
} | Where-Object { $_.Cmd -match 'Timebase\.' } | Sort-Object Port
```

The command line is the evidence: `Timebase.<Host>.exe`, or a `dotnet` invocation naming
`Timebase.<Host>.dll`. A listener whose owner is a Docker or WSL relay process is a container from
step 1, not a host process — never report it as one.

For which host owns which default port, **read the repo rather than remembering**: the workspace
tool's `list` verb prints every component's default pair (`dotnet run --project . -- list` in
`Timebase.Wizard/tools/Timebase.Wizard.Workspace`; it is `ComponentCatalog.cs`), and
`docs/e2e-host-runbook.md` §3 carries the same table with the UI dev-server ports. A stack folder's
`workspace-plan.json` (`<root>\{local|docker}\timebase_*`) states the published ports it was actually
given. Use all of that only to *label* what you found, never to assert something is running.

## 3. Confirm it actually answers

A listening socket is not a working backend. For each candidate that matters:

```sh
curl -k -s -o /dev/null -w '%{http_code}' https://localhost:<port>/
```

A TLS handshake plus any HTTP status confirms both the port and the scheme. A connection refused,
or a plain-HTTP answer on the port you assumed was HTTPS, is worth reporting exactly as observed.

## 4. Resolve to one target

If the caller named a host, resolve to exactly one, and **report every candidate rather than pick**
when it is ambiguous:

- **Two candidates for the same host** — a container and a host process, or two stacks up at once.
  List them both and stop; the caller chooses.
- **The named stack has no container for that host.** Say so and stop.
- **Nothing is running for that host.** Report it; do not start anything.

## 5. Hand back a usable answer

State, on one line per resolved target:

`<host> — <kind: container|host process> — <stack name or process id> — https://localhost:<port>`

Plus the HTTP port where one exists, and whether auth is enabled if that is knowable from what is
running (a stack's `workspace-plan.json` says `auth`; its `rr-stack.json` says which branch and
worktree it runs) — the caller usually needs both next.
If several backends are up but the caller named none, the table is the answer.

## Done when

- [ ] `docker ps` was read **before** any port scan, and every published container port was excluded
      from host-process reasoning.
- [ ] Every host process was identified by its command line, not by the port it holds.
- [ ] Each resolved target was confirmed to answer, with the scheme observed rather than assumed.
- [ ] Ambiguity was returned as a list of candidates instead of resolved by guessing.
- [ ] Nothing was started, stopped, or reconfigured.
