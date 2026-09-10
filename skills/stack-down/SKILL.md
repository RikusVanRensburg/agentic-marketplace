---
name: stack-down
description: Stop a Timebase stack and clean up after it — processes or containers, volumes, networks and the stack folder — leaving nothing behind and nothing else touched.
---

# Take a stack down

Two different jobs, and the caller means one of them:

- **Stop it** — `down`, data kept, the stack can be brought back up unchanged.
- **Remove it** — stop, wipe, and delete the folder. Nothing survives.

**Ask which when it is not stated.** Removal destroys collected history and the stack's `.env`,
and neither comes back.

## 1. Identify the stack — never clean one you were not asked to

```powershell
Get-ChildItem "<root>\local", "<root>\docker" -Directory -Filter "timebase_*"
```

Read each candidate's `workspace-plan.json` for its target, ports and components. With more than one
present and none named, list them and ask. A stack someone else is using looks exactly like an
abandoned one — the folder alone does not say.

## 2. Stop it

```sh
dotnet run --project . -- down --config <stack>/workspace.config
```

`down` keeps data, so stopping and starting again loses nothing. For **removal**, add `--purge`,
which also wipes the data — Docker volumes, or the component directories for a local stack — and
means Pulse would regenerate every client secret if it ever came back up.

## 3. Confirm it actually stopped

`down` reporting success is not proof the machine is clear.

**Local** — `processes.json` records exactly what the workspace started, which is what makes this
checkable. Confirm none of those process ids are alive, and look for children that outlived their
parent (a dev server or plugin host started by a component). Kill only processes that belong to
**this** stack, identified by their command line pointing inside its folder:

```powershell
Get-Process | Where-Object {
  (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -match '<stack id>'
}
```

**Docker** — the compose project is the stack id:

```sh
docker ps -a --filter "label=com.docker.compose.project=<stack id>"
docker volume ls --filter "label=com.docker.compose.project=<stack id>"
docker network ls --filter "label=com.docker.compose.project=<stack id>"
```

Anything still listed after a purge is a leftover to remove by name. Never run a blanket
`docker system prune` — it reaches other people's stacks and unrelated images.

## 4. Delete the folder (removal only)

The folder holds the workspace, its logs, its plan and its `.env`. Deleting it is the point, but do
it **after** step 3 — a live process holding a file makes the delete fail partway and leaves a
half-removed stack, which is worse than either state.

```powershell
Remove-Item -Recurse -Force "<stack folder>"
```

If the delete fails on a busy file, that is an unstopped process — go back to step 3 rather than
retrying with more force.

Then remove the `local\` or `docker\` parent **only if it is now empty**; it usually holds other
stacks.

## 5. What not to touch

- **The `<root>\bin\<branch-slug>` folder** — assembled binaries or junctions shared by several
  stacks. Removing it breaks the others.
- **Images** — `timebase/*` images are expensive to rebuild and shared by every Docker stack. Leave
  them unless explicitly asked.
- **Anything outside the stack folder**, including the machine's installed Timebase and its
  services. A workspace never touched them and neither does this.

## 6. Report

- Which stack, and whether it was stopped or removed.
- What was actually confirmed gone: processes or containers, volumes, networks, the folder.
- What was left deliberately: the shared bin folder, images, a non-empty parent, another stack.
- Which ports are now free — useful for whatever comes up next.

## Done when

- [ ] The caller's intent — stop or remove — was established, not inferred.
- [ ] The target stack was identified from its own plan, and nothing else was touched.
- [ ] Processes or containers were confirmed gone by evidence, not by `down`'s exit code.
- [ ] For a removal: volumes and networks are gone, the folder is deleted, and the parent was
      removed only if empty.
- [ ] The shared bin folder and the images were left alone unless removing them was asked for.
