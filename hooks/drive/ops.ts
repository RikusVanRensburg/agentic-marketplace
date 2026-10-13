// What the slash command and the model's tools both call. Each action reads the
// manifest, changes the folder and the row together, and answers in a few lines.

import {
  composePorts,
  composeProblems,
  composeRel,
  docsCell,
  docsId,
  dockerFile,
  type DocsStatus,
  findRow,
  formatPorts,
  groupOf,
  isDocsStatus,
  isInside,
  isoDate,
  isTestingStatus,
  isTier,
  type Item,
  itemKey,
  join,
  nameProblem,
  parsePorts,
  plan,
  portClashes,
  slash,
  slugProblem,
  stackKeyOfFile,
  stackName,
  testingId,
  type Tier,
  untracked,
} from './model'
import {
  type Io,
  composeConfig,
  composeDown,
  type Config,
  dirs,
  editTable,
  listKind,
  makeDir,
  manifestOf,
  projects,
  pruneEmpty,
  readTable,
  removeTree,
  snapshot,
  stopProcessesUnder,
  walkFiles,
} from './io'
import { cell, rowOf, type Table, withCell } from './table'

const fail = (text: string): never => {
  throw new Error(text)
}

const need = (value: string | undefined, what: string) => (value && value.trim() ? value.trim() : fail(`${what} is missing.`))

const checkName = (name: string, what: string) => {
  const problem = nameProblem(name)
  if (problem) fail(`The ${what} "${name}" ${problem}.`)
}

// ---- testing

export const runNew = async (io: Io, c: Config, product: string, run: string, what: string) => {
  product = need(product, 'The product')
  run = need(run, 'The run name')
  what = need(what, 'What the run is')
  checkName(product, 'product')
  checkName(run, 'run name')
  const id = `${product}/${run}`
  const folder = join(dirs(c).testing, id)
  if (await io.exists(folder)) fail(`${folder} already exists.`)
  await editTable(io, manifestOf(c, 'testing'), t => {
    if (findRow(t, testingId, id) >= 0) fail(`The manifest already has a row for ${id}.`)
    t.rows.push(rowOf(t, { run, path: `${product}\\${run}`, 'what it is': what, status: 'running' }))
  })
  await makeDir(io, folder)
  return `Created ${folder} and its manifest row, status running.`
}

export const runStatus = async (io: Io, c: Config, id: string, status: string, note = '') => {
  id = slash(need(id, 'The run (product/run)'))
  if (!isTestingStatus(status)) fail(`The status must be one of running, done, abandoned.`)
  const value = note.trim() ? `${status}: ${note.trim()}` : status
  await editTable(io, manifestOf(c, 'testing'), t => {
    const i = findRow(t, testingId, id)
    if (i < 0) fail(`The manifest has no row for ${id}.`)
    t.rows[i] = withCell(t, t.rows[i]!, 'status', value)
  })
  return `${id} is now ${value}.`
}

// Stops what runs from the folder, deletes it and drops its row. Works on a folder with no row too.
export const runRemove = async (io: Io, c: Config, id: string) => {
  id = slash(need(id, 'The run (product/run)'))
  const base = dirs(c).testing
  const folder = join(base, id)
  if (!isInside(base, folder, 2)) fail(`${id} is not a product/run.`)
  const lines: string[] = []
  for (const p of (await projects(io)) ?? []) {
    if (p.configFiles.some(f => isInside(folder, f))) {
      await composeDown(io, p.name)
      lines.push(`Took down docker project ${p.name}.`)
    }
  }
  const stopped = await stopProcessesUnder(io, folder)
  if (stopped.length) lines.push(`Stopped processes ${stopped.join(', ')}.`)
  const existed = await io.exists(folder)
  await removeTree(io, c, folder)
  if (existed) lines.push(`Deleted ${folder}.`)
  let hadRow = false
  await editTable(io, manifestOf(c, 'testing'), t => {
    const i = findRow(t, testingId, id)
    if (i >= 0) {
      hadRow = true
      t.rows.splice(i, 1)
    }
  })
  if (hadRow) lines.push('Dropped its manifest row.')
  if (!existed && !hadRow) fail(`Nothing found for ${id}.`)
  return lines.join('\n')
}

// ---- docker

const SKELETON = (name: string) => `name: ${name}\n\nservices: {}\n`

export const stackNew = async (io: Io, c: Config, tierText: string, repo: string, slug: string, what: string) => {
  const given = need(tierText, 'The tier (products or support)')
  const tier: Tier = isTier(given) ? given : fail('The tier must be products or support.')
  repo = need(repo, 'The repo or thing')
  slug = need(slug, 'The slug')
  what = need(what, 'What the stack gives you')
  checkName(repo, 'repo')
  const bad = slugProblem(slug)
  if (bad) fail(`The slug "${slug}" ${bad}.`)
  const name = stackName(repo, slug)
  const rel = composeRel(tier, repo, slug)
  const d = dirs(c).docker
  const file = join(d, rel)
  await editTable(io, manifestOf(c, 'docker'), t => {
    if (t.rows.some(r => cell(t, r, 'stack').toLowerCase() === name)) fail(`The manifest already has a stack ${name}.`)
    t.rows.push(rowOf(t, { stack: name, 'what it gives you': what, ports: '', file: rel }))
  })
  await makeDir(io, join(d, 'volumes', tier, repo, slug))
  const lines = [`Added ${name} to the manifest and created its volumes folder.`]
  if (await io.exists(file)) {
    lines.push(await stackSync(io, c, name))
  } else {
    await io.write(file, SKELETON(name))
    lines.push(`Wrote a skeleton ${file}. Fill in its services, then run stack sync to record the ports.`)
  }
  return lines.join('\n')
}

// Reads every stack's compose file through docker and reports what breaks the rules; with
// `write`, records the ports it found in the manifest.
export const stackSync = async (io: Io, c: Config, only?: string, write = true) => {
  const d = dirs(c).docker
  const lines: string[] = []
  const ports: { name: string; ports: number[] }[] = []
  const edit = write ? editTable : async (_: Io, path: string, change: (t: Table) => unknown) => change(await readTable(io, path))
  await edit(io, manifestOf(c, 'docker'), async t => {
    for (let i = 0; i < t.rows.length; i++) {
      const row = t.rows[i]!
      const name = cell(t, row, 'stack')
      const rel = dockerFile(t, row)
      const key = stackKeyOfFile(rel)
      if (only && name.toLowerCase() !== only.toLowerCase()) {
        ports.push({ name, ports: parsePorts(cell(t, row, 'ports')) })
        continue
      }
      if (!key) {
        lines.push(`${name}: file "${rel}" is not compose/<tier>/<repo>/<slug>/compose.yml.`)
        continue
      }
      const file = join(d, rel)
      if (!(await io.exists(file))) {
        lines.push(`${name}: ${file} is missing.`)
        continue
      }
      try {
        const facts = await composeConfig(io, file)
        const found = composePorts(facts)
        const text = formatPorts(found)
        if (text !== cell(t, row, 'ports')) {
          t.rows[i] = withCell(t, row, 'ports', text)
          lines.push(write ? `${name}: ports now ${text || 'none'}.` : `${name}: ports are ${text || 'none'}, the row says ${cell(t, row, 'ports') || 'none'}.`)
        }
        for (const p of composeProblems(facts, key, d)) lines.push(`${name}: ${p}.`)
        ports.push({ name, ports: found })
      } catch (err) {
        lines.push(`${name}: ${(err as Error).message}`)
      }
    }
  }).catch(err => fail((err as Error).message))
  for (const x of portClashes(ports)) lines.push(`${x.a} and ${x.b} share ports ${formatPorts(x.ports)}, so they cannot run together.`)
  return lines.length ? lines.join('\n') : 'Every stack matches its compose file.'
}

export const stackRemove = async (io: Io, c: Config, name: string) => {
  name = need(name, 'The stack name')
  const d = dirs(c).docker
  const t = await readTable(io, manifestOf(c, 'docker'))
  const row = t.rows.find(r => cell(t, r, 'stack').toLowerCase() === name.toLowerCase())
  if (!row) fail(`The manifest has no stack ${name}.`)
  const rel = dockerFile(t, row!)
  const key = stackKeyOfFile(rel) ?? fail(`${name}: file "${rel}" is not compose/<tier>/<repo>/<slug>/compose.yml.`)
  const file = join(d, rel)
  const lines: string[] = []
  if (await io.exists(file)) {
    await composeDown(io, cell(t, row!, 'stack'), file)
    lines.push(`Took down ${name}.`)
  }
  for (const tree of ['compose', 'volumes']) {
    const dir = join(d, tree, key)
    if (await io.exists(dir)) {
      await removeTree(io, c, dir)
      await pruneEmpty(io, c, join(d, tree), dir.slice(0, dir.lastIndexOf('/')))
      lines.push(`Deleted ${dir}.`)
    }
  }
  await editTable(io, manifestOf(c, 'docker'), t2 => {
    t2.rows = t2.rows.filter(r => cell(t2, r, 'stack').toLowerCase() !== name.toLowerCase())
  })
  lines.push('Dropped its manifest row.')
  return lines.join('\n')
}

// ---- docs

export const docAdd = async (io: Io, c: Config, path: string, what: string) => {
  path = slash(need(path, 'The document path')).replace(/^\/+/, '')
  what = need(what, 'What the document covers')
  const d = dirs(c).docs
  if (!isInside(d, join(d, path), 2)) fail(`${path} should sit under an org, repo or support folder.`)
  if (!(await io.exists(join(d, path)))) fail(`${join(d, path)} does not exist. Write the document first.`)
  const today = isoDate(await io.now())
  await editTable(io, manifestOf(c, 'docs'), t => {
    if (findRow(t, docsId, path) >= 0) fail(`The manifest already has ${path}.`)
    t.rows.push(rowOf(t, { document: docsCell(path), 'what it covers': what, status: 'current', updated: today }))
  })
  const spaced = path.split('/').filter(s => /\s/.test(s))
  const warn = spaced.length ? ` Note: ${spaced.map(s => `"${s}"`).join(', ')} has a space in it.` : ''
  return `Added ${path} to the docs manifest as current.${warn}`
}

export const docStatus = async (io: Io, c: Config, path: string, status: string) => {
  path = slash(need(path, 'The document path')).replace(/^\/+/, '')
  if (!isDocsStatus(status)) fail('The status must be one of current, superseded, abandoned.')
  const today = isoDate(await io.now())
  await editTable(io, manifestOf(c, 'docs'), t => {
    const i = findRow(t, docsId, path)
    if (i < 0) fail(`The docs manifest has no row for ${path}.`)
    let row = withCell(t, t.rows[i]!, 'status', status as DocsStatus)
    row = withCell(t, row, 'updated', today)
    t.rows[i] = row
  })
  return `${path} is now ${status}.`
}

// ---- check and clean

const describe = (items: readonly Item[]) =>
  items.map((it, n) => `${n + 1}. ${it.area} ${it.kind} ${it.id}: ${it.why}`)

export const check = async (io: Io, c: Config) => {
  const d = dirs(c)
  const { snap, notes } = await snapshot(io, c)
  const items = plan(snap)
  const out: string[] = []

  out.push(items.length ? `To clean (${items.length}), see /drive clean:` : 'Nothing to clean.')
  out.push(...describe(items))

  const loose: string[] = []
  if (snap.testing) {
    const tracked = snap.testing.table.rows.map(r => testingId(snap.testing!.table, r))
    for (const id of untracked(tracked, snap.testing.folders.keys())) loose.push(`testing ${id}: folder with no row`)
    for (const product of await listKind(io, d.testing, 'file')) {
      if (!/^(manifest|readme|claude)\.md$/i.test(product)) loose.push(`testing ${product}: a file at the top of testing\\`)
    }
    for (const product of await listKind(io, d.testing, 'dir')) {
      for (const f of await listKind(io, join(d.testing, product), 'file')) loose.push(`testing ${product}/${f}: a file beside the runs`)
    }
  }
  if (snap.docker) {
    const tracked = snap.docker.table.rows.map(r => stackKeyOfFile(dockerFile(snap.docker!.table, r)) ?? '')
    for (const key of untracked(tracked, snap.docker.composeKeys)) loose.push(`docker ${key}: compose file with no row`)
    for (const p of snap.docker.projects) {
      if (p.isRunning && !p.configFiles.some(f => isInside(d.docker, f))) {
        loose.push(`docker project ${p.name}: running from ${p.configFiles.join(', ') || 'an unknown file'}, outside docker\\`)
      }
    }
  }
  if (snap.docs) {
    const tracked = snap.docs.table.rows.map(r => docsId(snap.docs!.table, r))
    const files = (await walkFiles(io, d.docs)).filter(f => !/^(manifest|claude)\.md$/i.test(f))
    const groups = new Map<string, number>()
    for (const f of untracked(tracked, files)) groups.set(groupOf(f, 3), (groups.get(groupOf(f, 3)) ?? 0) + 1)
    for (const [g, n] of groups) loose.push(`docs ${g}: ${n} file${n === 1 ? '' : 's'} with no row`)
  }
  if (loose.length) out.push('', `Not in a manifest (${loose.length}), report only:`, ...loose.map(l => `- ${l}`))

  const names: string[] = []
  if (snap.testing) {
    for (const id of snap.testing.folders.keys()) {
      const [product, run] = id.split('/')
      const p = nameProblem(run!) ?? nameProblem(product!)
      if (p) names.push(`testing ${id} ${p}`)
    }
  }
  for (const top of [d.docs]) {
    for (const org of await listKind(io, top, 'dir')) {
      for (const sub of await listKind(io, join(top, org), 'dir')) if (/\s/.test(sub)) names.push(`docs ${org}/${sub} has a space`)
    }
  }
  if (names.length) out.push('', 'Names that break the rules:', ...names.map(n => `- ${n}`))

  if (snap.docker && snap.docker.table.rows.length) out.push('', 'Docker stacks:', await stackSync(io, c, undefined, false))
  if (notes.length) out.push('', ...notes)
  return out.join('\n')
}

const PLAN_KEY = 'cleanPlan'
const PLAN_TTL_MS = 60 * 60 * 1000

type StoredPlan = { at: number; keys: string[]; items: Item[] }

export const cleanPlan = async (io: Io, c: Config) => {
  const { snap, notes } = await snapshot(io, c)
  const items = plan(snap)
  await io.storeSet(PLAN_KEY, { at: snap.now, keys: items.map(itemKey), items } satisfies StoredPlan)
  if (!items.length) return ['Nothing to clean.', ...notes].join('\n')
  return [
    `Cleanup plan (${items.length}):`,
    ...describe(items),
    '',
    'Run /drive clean apply to carry out all of it, or /drive clean apply 1,3,5-7 for some.',
    ...notes,
  ].join('\n')
}

const carryOut = async (io: Io, c: Config, it: Item): Promise<string> => {
  const d = dirs(c)
  switch (`${it.area}:${it.kind}`) {
    case 'testing:remove-run':
      return runRemove(io, c, it.id)
    case 'testing:drop-row':
      await editTable(io, manifestOf(c, 'testing'), t => {
        t.rows = t.rows.filter(r => testingId(t, r).toLowerCase() !== it.id.toLowerCase())
      })
      return `Dropped the testing row ${it.id}.`
    case 'docker:drop-row':
      await editTable(io, manifestOf(c, 'docker'), t => {
        t.rows = t.rows.filter(r => cell(t, r, 'stack').toLowerCase() !== it.id.toLowerCase())
      })
      return `Dropped the docker row ${it.id}.`
    case 'docker:remove-volumes': {
      const dir = join(d.docker, 'volumes', it.id)
      await removeTree(io, c, dir)
      await pruneEmpty(io, c, join(d.docker, 'volumes'), dir.slice(0, dir.lastIndexOf('/')))
      return `Deleted ${dir}.`
    }
    case 'docker:stop-stack':
      await composeDown(io, it.id)
      return `Took down ${it.id}; its files, data and row are kept.`
    case 'docs:remove-doc': {
      const file = join(d.docs, it.id)
      await removeTree(io, c, file)
      await pruneEmpty(io, c, d.docs, file.slice(0, file.lastIndexOf('/')))
      await editTable(io, manifestOf(c, 'docs'), t => {
        t.rows = t.rows.filter(r => docsId(t, r).toLowerCase() !== it.id.toLowerCase())
      })
      return `Deleted ${file} and its row.`
    }
    case 'docs:drop-row':
      await editTable(io, manifestOf(c, 'docs'), t => {
        t.rows = t.rows.filter(r => docsId(t, r).toLowerCase() !== it.id.toLowerCase())
      })
      return `Dropped the docs row ${it.id}.`
    default:
      return fail(`Unknown item ${it.area} ${it.kind}.`)
  }
}

// Carries out the last plan shown, or the numbered part of it. An item is acted on only
// when a fresh plan still holds it, so nothing that changed since is touched.
export const cleanApply = async (io: Io, c: Config, numbers: readonly number[]) => {
  const stored = (await io.storeGet(PLAN_KEY)) as StoredPlan | undefined
  const now = await io.now()
  if (!stored || now - stored.at > PLAN_TTL_MS) fail('No recent plan. Run /drive clean first.')
  const chosen = numbers.length ? numbers : stored!.items.map((_, i) => i + 1)
  const bad = chosen.filter(n => n < 1 || n > stored!.items.length)
  if (bad.length) fail(`No item ${bad.join(', ')} in the plan.`)
  const { snap } = await snapshot(io, c)
  const fresh = new Set(plan(snap).map(itemKey))
  const lines: string[] = []
  for (const n of chosen) {
    const it = stored!.items[n - 1]!
    if (!fresh.has(itemKey(it))) {
      lines.push(`${n}. skipped, ${it.area} ${it.id} is no longer in the plan.`)
      continue
    }
    try {
      lines.push(`${n}. ${(await carryOut(io, c, it)).replace(/\n/g, ' ')}`)
    } catch (err) {
      lines.push(`${n}. failed: ${(err as Error).message}`)
    }
  }
  await io.storeDelete(PLAN_KEY)
  return lines.join('\n')
}

// A short count for the session start toast, without asking docker.
export const staleCount = async (io: Io, c: Config) => {
  const { snap } = await snapshot(io, c, false)
  const items = plan(snap)
  const by = (a: string) => items.filter(i => i.area === a).length
  return { total: items.length, testing: by('testing'), docker: by('docker'), docs: by('docs') }
}

