// The disk, docker and process side of the drive mod. Every delete goes through
// removeTree, which refuses anything not at least two folders inside one of the three
// managed trees.

import type { FsEntry, FsStat, FsStatOptions, ProcessRunInit, ProcessRunResult } from 'claude-code'

import {
  type ComposeFacts,
  docsId,
  join,
  isInside,
  normRoot,
  parseComposeLs,
  parseDockerPs,
  type Project,
  readComposeConfig,
  slash,
  type Snapshot,
} from './model'
import { parseTable, renderTable, type Table } from './table'

// What the drive mod needs from the engine. register.ts builds it from `$`, since `$`
// itself may not be handed across an import; a test builds it from a fake disk.
export type Io = {
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  list: (path: string) => Promise<FsEntry[]>
  stat: (path: string, options?: FsStatOptions) => Promise<FsStat>
  exists: (path: string) => Promise<boolean>
  run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>
  now: () => Promise<number>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  storeDelete: (key: string) => Promise<void>
}

export type Config = { root: string; staleDays: number; nudge: boolean }

export const configOf = (options: Readonly<Record<string, unknown>>): Config => ({
  root: normRoot(String(options.driveRoot ?? 'D:/')),
  staleDays: Number(options.staleDays ?? 7),
  nudge: options.nudge !== false,
})

export const dirs = (c: Config) => ({
  testing: join(c.root, 'testing'),
  docker: join(c.root, 'docker'),
  docs: join(c.root, 'docs'),
})

export const manifestOf = (c: Config, area: 'testing' | 'docker' | 'docs') => join(dirs(c)[area], 'manifest.md')

// ---- manifests

export const readTable = async (io: Io, path: string): Promise<Table> => parseTable(await io.read(path))

export const writeTable = (io: Io, path: string, t: Table) => io.write(path, renderTable(t))

// Reads the manifest, lets `change` edit its table, and writes it back.
export const editTable = async (io: Io, path: string, change: (t: Table) => Table | void | Promise<Table | void>) => {
  const t = await readTable(io, path)
  const next = (await change(t)) ?? t
  await writeTable(io, path, next)
  return next
}

// ---- folders

export const listKind = async (io: Io, path: string, kind: 'dir' | 'file') => {
  const entries = await io.list(path).catch(() => [])
  return entries.filter(e => e.kind === kind).map(e => e.name)
}

// The newest of a folder's own time and its direct children's.
export const touchedMs = async (io: Io, path: string) => {
  const own = await io.stat(path).catch(() => undefined)
  const entries = await io.list(path).catch(() => [])
  return Math.max(own?.mtimeMs ?? 0, ...entries.map(e => e.mtimeMs))
}

// Every file under `path`, relative to it, with forward slashes; `limit` bounds the walk.
export const walkFiles = async (io: Io, path: string, limit = 20000): Promise<string[]> => {
  const out: string[] = []
  const queue = ['']
  while (queue.length && out.length < limit) {
    const rel = queue.shift()!
    const entries = await io.list(rel ? join(path, rel) : path).catch(() => [])
    for (const e of entries) {
      const child = rel ? `${rel}/${e.name}` : e.name
      if (e.kind === 'dir') queue.push(child)
      else if (e.kind === 'file') out.push(child)
    }
  }
  return out
}

const powershell = (io: Io, script: string, env: Record<string, string> = {}, timeoutMs = 120000) =>
  io.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', script], { env, timeoutMs })

// Deletes a folder or a file. Refuses anything not at least two levels inside a managed tree.
export const removeTree = async (io: Io, c: Config, path: string) => {
  const d = dirs(c)
  const isAllowed = [d.testing, d.docker, d.docs].some(base => isInside(base, path, 2))
  if (!isAllowed) throw new Error(`refused to delete ${path}: not inside a managed folder`)
  if (!(await io.exists(path))) return
  // A recursive delete through a link can empty what it points at: leave links to a person.
  if ((await io.stat(path)).isLink) throw new Error(`refused to delete ${path}: it is a link`)
  const ran = await powershell(io, 'Remove-Item -LiteralPath $env:DRIVE_PATH -Recurse -Force -ErrorAction Stop', {
    DRIVE_PATH: path.replace(/\//g, '\\'),
  })
  if (ran.exitCode !== 0) throw new Error(`could not delete ${path}: ${ran.stderr.trim()}`)
}

export const makeDir = async (io: Io, path: string) => {
  const ran = await powershell(io, 'New-Item -ItemType Directory -Force -Path $env:DRIVE_PATH | Out-Null', {
    DRIVE_PATH: path.replace(/\//g, '\\'),
  })
  if (ran.exitCode !== 0) throw new Error(`could not create ${path}: ${ran.stderr.trim()}`)
}

// Removes empty folders from `path` upwards, stopping at `base`.
export const pruneEmpty = async (io: Io, c: Config, base: string, path: string) => {
  let dir = slash(path)
  while (isInside(base, dir, 1)) {
    const entries = await io.list(dir).catch(() => undefined)
    if (!entries || entries.length) return
    if (!isInside(base, dir, 2)) {
      // one level under a tree's root is a product, repo or org folder: never removed
      return
    }
    await removeTree(io, c, dir)
    dir = dir.slice(0, dir.lastIndexOf('/'))
  }
}

// Stops every process whose executable or command line names the folder. Returns the ids.
export const stopProcessesUnder = async (io: Io, path: string): Promise<number[]> => {
  const script = [
    "$p = $env:DRIVE_PATH.TrimEnd('\\','/')",
    "$pats = @([regex]::Escape($p.Replace('/','\\')), [regex]::Escape($p.Replace('\\','/'))) | ForEach-Object { $_ + '([\\\\/\"\\s]|$)' }",
    'function Hit($s) { if (-not $s) { return $false }; foreach ($r in $pats) { if ($s -match $r) { return $true } }; return $false }',
    'Get-CimInstance Win32_Process |',
    '  Where-Object { $_.ProcessId -ne $PID -and ((Hit $_.ExecutablePath) -or (Hit $_.CommandLine)) } |',
    '  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }',
  ].join('\n')
  const ran = await powershell(io, script, { DRIVE_PATH: path })
  return ran.stdout.split(/\r?\n/).map(Number).filter(n => Number.isInteger(n) && n > 0)
}

// ---- docker

export const docker = (io: Io, args: string[], timeoutMs = 120000) => io.run(['docker', ...args], { timeoutMs })

// Compose projects Docker knows, with when each running one started; undefined when Docker is not answering.
export const projects = async (io: Io): Promise<Project[] | undefined> => {
  const ls = await docker(io, ['compose', 'ls', '--all', '--format', 'json'], 20000).catch(() => undefined)
  if (!ls || ls.exitCode !== 0) return undefined
  const list = parseComposeLs(ls.stdout)
  const ps = await docker(io, ['ps', '--format', '{{json .}}'], 20000).catch(() => undefined)
  const started = ps && ps.exitCode === 0 ? parseDockerPs(ps.stdout) : new Map<string, number>()
  return list.map(p => ({ ...p, startedMs: started.get(p.name) }))
}

export const composeConfig = async (io: Io, file: string): Promise<ComposeFacts> => {
  const ran = await docker(io, ['compose', '-f', file, 'config', '--format', 'json'], 60000)
  if (ran.exitCode !== 0) throw new Error(ran.stderr.trim() || `docker compose config failed on ${file}`)
  return readComposeConfig(ran.stdout)
}

export const composeDown = async (io: Io, name: string, file?: string) => {
  const args = file ? ['compose', '-f', file, '-p', name, 'down', '--remove-orphans'] : ['compose', '-p', name, 'down', '--remove-orphans']
  const ran = await docker(io, args, 300000)
  if (ran.exitCode !== 0) throw new Error(`docker compose down ${name}: ${ran.stderr.trim()}`)
}

// `tier/repo/slug` of every stack folder under compose\ or volumes\.
export const stackKeys = async (io: Io, base: string) => {
  const out: string[] = []
  for (const tier of await listKind(io, base, 'dir')) {
    for (const repo of await listKind(io, join(base, tier), 'dir')) {
      for (const slug of await listKind(io, join(base, tier, repo), 'dir')) out.push(`${tier}/${repo}/${slug}`)
    }
  }
  return out
}

// ---- the snapshot a plan is made from

export const snapshot = async (io: Io, c: Config, withDocker = true): Promise<{ snap: Snapshot; notes: string[] }> => {
  const d = dirs(c)
  const notes: string[] = []
  const snap: Snapshot = { now: await io.now(), staleDays: c.staleDays }

  try {
    const table = await readTable(io, manifestOf(c, 'testing'))
    const folders = new Map<string, number>()
    for (const product of await listKind(io, d.testing, 'dir')) {
      for (const run of await listKind(io, join(d.testing, product), 'dir')) {
        folders.set(`${product}/${run}`, await touchedMs(io, join(d.testing, product, run)))
      }
    }
    snap.testing = { table, folders }
  } catch (err) {
    notes.push(`testing skipped: ${(err as Error).message}`)
  }

  try {
    const table = await readTable(io, manifestOf(c, 'docker'))
    const composeKeys = new Set<string>()
    for (const key of await stackKeys(io, join(d.docker, 'compose'))) {
      if (await io.exists(join(d.docker, 'compose', key, 'compose.yml'))) composeKeys.add(key)
    }
    const volumeKeys = new Set(await stackKeys(io, join(d.docker, 'volumes')))
    let list: Project[] = []
    if (withDocker) {
      const found = await projects(io)
      if (found) list = found
      else notes.push('docker is not answering: running stacks were not checked')
    }
    snap.docker = { table, composeKeys, volumeKeys, projects: list, root: d.docker }
  } catch (err) {
    notes.push(`docker skipped: ${(err as Error).message}`)
  }

  try {
    const table = await readTable(io, manifestOf(c, 'docs'))
    const files = new Set<string>()
    for (const row of table.rows) {
      const id = docsId(table, row)
      if (id && (await io.exists(join(d.docs, id)))) files.add(id)
    }
    snap.docs = { table, files }
  } catch (err) {
    notes.push(`docs skipped: ${(err as Error).message}`)
  }

  return { snap, notes }
}
