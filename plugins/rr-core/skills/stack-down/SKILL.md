---
name: stack-down
description: Stop a Timebase stack, or remove it entirely — processes or containers, volumes, network and the stack folder — once the caller has said which, leaving nothing behind and nothing else touched.
---

# Take a stack down

Two different jobs, and the caller means one of them:

- **Stop it** — `down`, data kept, the stack can be brought back up unchanged.
- **Remove it** — stop, wipe, and delete the folder. Nothing survives.

**Ask which when it is not stated.** Removal destroys collected history, the wired content and the
stack's `.env`, and none of it comes back. `work-finish` states "remove"; a bare `/stack-down` with
no verb is a question, not a removal.

Every workspace verb takes `--config <stack>/workspace.config --workspace-dir <stack>`; without
`--workspace-dir` the tool looks for a `.workspace` beside the config and reports nothing to stop.

## 1. Identify the stack — never clean one you were not asked to

```powershell
Get-ChildItem "<root>\local", "<root>\docker" -Directory -Filter "timebase_*"
```

Read each candidate's `rr-stack.json` (branch, worktree, `--bin`) and `workspace-plan.json` (ports,
components). With more than one present and none named, list them and ask. A stack someone else is
using looks exactly like an abandoned one — the folder alone does not say.

**Copy the pid list out of `processes.json` before stopping** — `down` deletes that file, and it is
the only record of what was started.

## 2. Stop it

```sh
dotnet run --project . -- down --config <stack>/workspace.config --workspace-dir <stack> [--purge]
```

The tool decides the target from the folder: `processes.json` present means local processes,
otherwise `docker compose down`. Without `--purge` data is kept, so stopping and starting again
loses nothing. For **removal**, add `--purge`: Docker gets `compose down -v` (containers, network
and volumes); a local stack has each `<stack>/<service>/` root deleted — `logs/`, `.env`, the plan
and `rr-stack.json` stay for step 4. Either way Pulse would regenerate every client secret if the
stack ever came back up.

## 3. Confirm it actually stopped

`down` reporting success is not proof the machine is clear.

**Local** — check the pids you copied are gone, and look for children that outlived their parent.
Kill only processes that belong to **this** stack, identified by a command line pointing inside its
folder or its `--bin`:

```powershell
Get-Process | Where-Object {
  (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -match '<stack id>'
}
```

**Docker** — the compose project is the stack id when `stack-up` passed `--project <id>`
(otherwise `timebase-<workspace name slug>`):

```sh
docker ps -a       --filter "label=com.docker.compose.project=<project>"
docker volume ls   --filter "label=com.docker.compose.project=<project>"
docker network ls  --filter "label=com.docker.compose.project=<project>"
```

Anything still listed after a purge is a leftover to remove by name. Never run a blanket
`docker system prune` — it reaches other people's stacks and unrelated images.

## 4. Delete the folder (removal only)

The folder holds the workspace, its logs, its plan, `rr-stack.json` and its `.env`. Deleting it is
the point, but do it **after** step 3 — a live process holding a file makes the delete fail partway
and leaves a half-removed stack, which is worse than either state.

```powershell
Remove-Item -Recurse -Force "<stack folder>"
```

If the delete fails on a busy file, that is an unstopped process — go back to step 3 rather than
retrying with more force.

Then remove the `local\` or `docker\` parent **only if it is now empty**; it usually holds other
stacks.

## 5. What not to touch

- **The `<root>\bin\<branch-slug>` folder** — junctions into a worktree's build outputs, possibly
  shared by several stacks. Removing it breaks the others; removing the junctions' targets is the
  worktree's business, not this skill's.
- **Images** — `timebase/*` images are expensive to rebuild and shared by every Docker stack. Leave
  them unless explicitly asked.
- **Anything outside the stack folder**, including the machine's installed Timebase and its
  services. A workspace never touched them and neither does this.

## 6. Report

- Which stack, and whether it was stopped or removed.
- What was actually confirmed gone: processes or containers, volumes, network, the folder.
- What was left deliberately: the shared bin folder, images, a non-empty parent, another stack.
- Which ports are now free — useful for whatever comes up next.

## Done when

- [ ] The caller's intent — stop or remove — was established, not inferred.
- [ ] The target stack was identified from its own files, and nothing else was touched.
- [ ] The pids were copied before `down`, and processes or containers were confirmed gone by
      evidence, not by `down`'s exit code.
- [ ] For a removal: volumes and network are gone, the folder is deleted, and the parent was
      removed only if empty.
- [ ] The shared bin folder and the images were left alone unless removing them was asked for.
