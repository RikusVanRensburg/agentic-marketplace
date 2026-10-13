// The rules of D:\testing, D:\docker and D:\docs as pure functions: names, rows, ports,
// compose facts and the cleanup plan. Nothing here touches the disk; io.ts gathers a
// Snapshot and carries a plan out.

import { cell, type Table } from './table'

export type Area = 'testing' | 'docker' | 'docs'

export const DAY_MS = 24 * 60 * 60 * 1000

export const TESTING_STATUSES = ['running', 'done', 'abandoned'] as const
export const DOCS_STATUSES = ['current', 'superseded', 'abandoned'] as const
export const TIERS = ['products', 'support'] as const

export type TestingStatus = (typeof TESTING_STATUSES)[number]
export type DocsStatus = (typeof DOCS_STATUSES)[number]
export type Tier = (typeof TIERS)[number]

// ---- paths

export const slash = (p: string) => p.replace(/\\/g, '/')

export const normRoot = (root: string) => slash(root).replace(/\/+$/, '')

export const join = (...parts: string[]) =>
  parts.map((p, i) => (i === 0 ? slash(p).replace(/\/+$/, '') : slash(p).replace(/^\/+|\/+$/g, ''))).filter(Boolean).join('/')

export const samePath = (a: string, b: string) => slash(a).replace(/\/+$/, '').toLowerCase() === slash(b).replace(/\/+$/, '').toLowerCase()

// True when `path` lies at least `depth` folders below `base`, never `base` itself.
export const isInside = (base: string, path: string, depth = 1) => {
  const b = slash(base).replace(/\/+$/, '').toLowerCase()
  const p = slash(path).replace(/\/+$/, '').toLowerCase()
  if (!p.startsWith(b + '/')) return false
  const rest = p.slice(b.length + 1).split('/')
  return rest.length >= depth && rest.every(s => s !== '' && s !== '.' && s !== '..')
}

// ---- names

const DATE = /(19|20)\d{2}-?(0[1-9]|1[0-2])-?(0[1-9]|[12]\d|3[01])/

// Why a folder name breaks the rules, or undefined when it is fine.
export const nameProblem = (name: string): string | undefined => {
  if (name.trim() === '') return 'is empty'
  if (/\s/.test(name)) return 'has a space'
  if (DATE.test(name)) return 'has a date in it'
  if (!/^[a-z0-9]+([-.][a-z0-9]+)*$/.test(name)) return 'is not lowercase words joined by hyphens'
  return undefined
}

// A docker slug: two or three lowercase words, no date, version, branch or `test`.
export const slugProblem = (slug: string): string | undefined => {
  const plain = nameProblem(slug)
  if (plain) return plain
  const words = slug.split('-')
  if (words.length < 2 || words.length > 3) return 'is not two or three words'
  if (words.includes('test')) return 'has `test` in it'
  if (/\d/.test(slug)) return 'has a number or version in it'
  return undefined
}

// ---- statuses

// The status word of a cell such as `done: containers removed`.
export const statusWord = (text: string) => text.trim().split(/[\s:]/)[0]!.toLowerCase()

export const isTestingStatus = (s: string): s is TestingStatus => (TESTING_STATUSES as readonly string[]).includes(s)
export const isDocsStatus = (s: string): s is DocsStatus => (DOCS_STATUSES as readonly string[]).includes(s)
export const isTier = (s: string): s is Tier => (TIERS as readonly string[]).includes(s)

// ---- rows

// A testing row's id is its path cell with forward slashes: `timebase/config-migration`.
export const testingId = (t: Table, row: readonly string[]) => slash(cell(t, row, 'path')).replace(/^\/+|\/+$/g, '')

// A docs row's id is the link target of its document cell, or the cell itself.
export const docsId = (t: Table, row: readonly string[]) => {
  const text = cell(t, row, 'document')
  const link = /\]\(([^)]+)\)/.exec(text)
  return slash((link ? link[1]! : text).trim())
}

export const docsCell = (path: string) => `[${path}](${path})`

// The compose file of a docker row, relative to D:\docker.
export const dockerFile = (t: Table, row: readonly string[]) => slash(cell(t, row, 'file'))

export const stackName = (repo: string, slug: string) => `${repo}-${slug}`

export const composeRel = (tier: Tier, repo: string, slug: string) => `compose/${tier}/${repo}/${slug}/compose.yml`

// `compose/products/timebase/full-stack/compose.yml` to `products/timebase/full-stack`.
export const stackKeyOfFile = (file: string) => {
  const m = /^compose\/([^/]+)\/([^/]+)\/([^/]+)\/compose\.yml$/i.exec(slash(file))
  return m ? `${m[1]}/${m[2]}/${m[3]}` : undefined
}

export const findRow = (t: Table, idOf: (t: Table, row: readonly string[]) => string, id: string) =>
  t.rows.findIndex(r => idOf(t, r).toLowerCase() === slash(id).toLowerCase())

// ---- dates

export const isoDate = (ms: number) => {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

// ---- ports

export const formatPorts = (ports: readonly number[]): string => {
  const sorted = [...new Set(ports)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++
    parts.push(j === i ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`)
    i = j + 1
  }
  return parts.join(', ')
}

export const parsePorts = (text: string): number[] => {
  const out: number[] = []
  for (const m of text.matchAll(/(\d+)(?:\s*-\s*(\d+))?/g)) {
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    for (let p = a; p <= b && p - a < 10000; p++) out.push(p)
  }
  return out
}

// ---- compose facts, from `docker compose config --format json`

export type ComposeService = {
  name: string
  containerName?: string
  ports: number[]
  binds: string[]
  volumes: string[]
}

export type ComposeFacts = {
  name: string
  services: ComposeService[]
  topVolumes: string[]
}

type RawPort = { published?: string | number }
type RawMount = { type?: string; source?: string }
type RawService = { container_name?: string; ports?: RawPort[]; volumes?: RawMount[] }
type RawCompose = { name?: string; services?: Record<string, RawService>; volumes?: Record<string, unknown> }

export const readComposeConfig = (json: string): ComposeFacts => {
  const raw = JSON.parse(json) as RawCompose
  const services = Object.entries(raw.services ?? {}).map(([name, s]) => ({
    name,
    containerName: s.container_name,
    ports: (s.ports ?? []).flatMap(p => (p.published === undefined ? [] : parsePorts(String(p.published)))),
    binds: (s.volumes ?? []).filter(v => v.type === 'bind' && v.source).map(v => slash(v.source!)),
    volumes: (s.volumes ?? []).filter(v => v.type === 'volume').map(v => v.source ?? '(anonymous)'),
  }))
  return { name: raw.name ?? '', services, topVolumes: Object.keys(raw.volumes ?? {}) }
}

// What a compose file does against the D:\docker rules.
export const composeProblems = (facts: ComposeFacts, key: string, dockerRoot: string): string[] => {
  const [, repo, slug] = key.split('/')
  const out: string[] = []
  const want = stackName(repo!, slug!)
  if (facts.name !== want) out.push(`name is "${facts.name}", should be "${want}"`)
  const volumesDir = join(dockerRoot, 'volumes', key)
  for (const s of facts.services) {
    if (s.containerName) out.push(`${s.name} sets container_name`)
    for (const v of s.volumes) out.push(`${s.name} mounts named volume ${v}, use a bind mount`)
    for (const b of s.binds) {
      if (!isInside(volumesDir, b) && !samePath(volumesDir, b)) out.push(`${s.name} binds ${b}, outside ${volumesDir}`)
    }
  }
  if (facts.topVolumes.length) out.push(`declares named volumes: ${facts.topVolumes.join(', ')}`)
  return out
}

export const composePorts = (facts: ComposeFacts) => facts.services.flatMap(s => s.ports)

// Pairs of stacks whose published ports overlap.
export const portClashes = (stacks: readonly { name: string; ports: readonly number[] }[]) => {
  const out: { a: string; b: string; ports: number[] }[] = []
  for (let i = 0; i < stacks.length; i++) {
    for (let j = i + 1; j < stacks.length; j++) {
      const b = new Set(stacks[j]!.ports)
      const shared = [...new Set(stacks[i]!.ports)].filter(p => b.has(p))
      if (shared.length) out.push({ a: stacks[i]!.name, b: stacks[j]!.name, ports: shared })
    }
  }
  return out
}

// ---- docker runtime

export type Project = { name: string; isRunning: boolean; configFiles: string[]; startedMs?: number }

type RawLs = { Name?: string; Status?: string; ConfigFiles?: string }

export const parseComposeLs = (json: string): Project[] => {
  const text = json.trim()
  if (!text) return []
  const list = JSON.parse(text) as RawLs[]
  return list.map(p => ({
    name: p.Name ?? '',
    isRunning: /running/i.test(p.Status ?? ''),
    configFiles: (p.ConfigFiles ?? '').split(',').map(f => slash(f.trim())).filter(Boolean),
  }))
}

// `docker ps --format "{{json .}}"`: when each compose project's oldest running container started.
export const parseDockerPs = (text: string): Map<string, number> => {
  const out = new Map<string, number>()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const c = JSON.parse(line) as { Labels?: string; CreatedAt?: string }
    const project = /(?:^|,)com\.docker\.compose\.project=([^,]+)/.exec(c.Labels ?? '')?.[1]
    const at = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})/.exec(c.CreatedAt ?? '')
    if (!project || !at) continue
    const ms = Date.parse(`${at[1]}T${at[2]}${at[3]}:${at[4]}`)
    if (Number.isNaN(ms)) continue
    out.set(project, Math.min(out.get(project) ?? ms, ms))
  }
  return out
}

// ---- the cleanup plan

export type Kind = 'remove-run' | 'drop-row' | 'stop-stack' | 'remove-volumes' | 'remove-doc'

export type Item = {
  area: Area
  kind: Kind
  id: string
  why: string
}

export const itemKey = (i: Item) => `${i.area}:${i.kind}:${i.id.toLowerCase()}`

export type Snapshot = {
  now: number
  staleDays: number
  testing?: { table: Table; folders: ReadonlyMap<string, number> }
  docker?: {
    table: Table
    composeKeys: ReadonlySet<string>
    volumeKeys: ReadonlySet<string>
    projects: readonly Project[]
    root: string
  }
  docs?: { table: Table; files: ReadonlySet<string> }
}

const days = (ms: number) => Math.floor(ms / DAY_MS)

const lower = (s: Iterable<string>) => new Set([...s].map(x => x.toLowerCase()))

export const plan = (s: Snapshot): Item[] => {
  const items: Item[] = []
  const staleMs = s.staleDays * DAY_MS

  if (s.testing) {
    const { table, folders } = s.testing
    const byLower = new Map([...folders].map(([k, v]) => [k.toLowerCase(), v]))
    for (const row of table.rows) {
      const id = testingId(table, row)
      const status = statusWord(cell(table, row, 'status'))
      const touched = byLower.get(id.toLowerCase())
      if (touched === undefined) {
        items.push({ area: 'testing', kind: 'drop-row', id, why: 'row with no run folder' })
      } else if (status === 'done' || status === 'abandoned') {
        items.push({ area: 'testing', kind: 'remove-run', id, why: `status ${status}` })
      } else if (status === 'running' && s.now - touched > staleMs) {
        items.push({ area: 'testing', kind: 'remove-run', id, why: `running, untouched for ${days(s.now - touched)} days` })
      }
    }
  }

  if (s.docker) {
    const { table, composeKeys, volumeKeys, projects, root } = s.docker
    const composeLower = lower(composeKeys)
    for (const row of table.rows) {
      const key = stackKeyOfFile(dockerFile(table, row))
      if (!key || !composeLower.has(key.toLowerCase())) {
        items.push({ area: 'docker', kind: 'drop-row', id: cell(table, row, 'stack'), why: 'row with no compose file' })
      }
    }
    for (const key of volumeKeys) {
      if (!composeLower.has(key.toLowerCase())) {
        items.push({ area: 'docker', kind: 'remove-volumes', id: key, why: 'volumes with no compose file' })
      }
    }
    const composeDir = join(root, 'compose')
    for (const p of projects) {
      if (!p.isRunning || p.startedMs === undefined) continue
      if (!p.configFiles.some(f => isInside(composeDir, f))) continue
      if (s.now - p.startedMs > staleMs) {
        items.push({ area: 'docker', kind: 'stop-stack', id: p.name, why: `running for ${days(s.now - p.startedMs)} days` })
      }
    }
  }

  if (s.docs) {
    const { table, files } = s.docs
    const filesLower = lower(files)
    for (const row of table.rows) {
      const id = docsId(table, row)
      const status = statusWord(cell(table, row, 'status'))
      if (!filesLower.has(id.toLowerCase())) {
        items.push({ area: 'docs', kind: 'drop-row', id, why: 'row with no file' })
      } else if (status === 'superseded' || status === 'abandoned') {
        items.push({ area: 'docs', kind: 'remove-doc', id, why: `status ${status}` })
      }
    }
  }

  return items
}

// ---- untracked and misnamed things, for `check`

export const untracked = (tracked: Iterable<string>, present: Iterable<string>) => {
  const known = lower(tracked)
  return [...present].filter(p => !known.has(p.toLowerCase())).sort()
}

// The folder a file is reported under: the first `depth` segments of its path.
export const groupOf = (path: string, depth: number) => slash(path).split('/').slice(0, depth).join('/')

// ---- the slash command's arguments

export const tokens = (args: string): string[] => {
  const out: string[] = []
  for (const m of args.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) out.push(m[1] ?? m[2] ?? m[3]!)
  return out
}

// `1,3 5-7` to [1, 3, 5, 6, 7].
export const picks = (parts: readonly string[]): number[] =>
  parts.flatMap(p => p.split(',')).filter(Boolean).flatMap(p => {
    const m = /^(\d+)(?:-(\d+))?$/.exec(p.trim())
    if (!m) throw new Error(`"${p}" is not an item number`)
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    return Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k)
  })
