// The drive mod: D:\testing, D:\docker and D:\docs kept to their manifests by code.
// One slash command for the person, four tools for the model, a guard that keeps
// hand edits off the manifests, and a nudge at session start when something is stale.

import type { EngineInterface, Register } from 'claude-code'

import { configOf, type Config, type Io, manifestOf } from './io'
import { picks, samePath, slash, tokens } from './model'
import {
  check,
  cleanApply,
  cleanPlan,
  docAdd,
  docStatus,
  runNew,
  runRemove,
  runStatus,
  stackNew,
  stackRemove,
  stackSync,
  staleCount,
} from './ops'


const USAGE = [
  'Usage: /drive <action>',
  '  check                                   what is stale, untracked or misnamed (changes nothing)',
  '  clean                                   show the cleanup plan',
  '  clean apply [1,3,5-7]                   carry out the plan, or the numbered part of it',
  '  run new <product> <run> "<what>"        testing run folder and its row',
  '  run status <product>/<run> <running|done|abandoned> ["<note>"]',
  '  run remove <product>/<run>              stop what runs from it, delete it, drop its row',
  '  stack new <products|support> <repo> <slug> "<what>"',
  '  stack sync [<stack>]                    record ports from compose files, report rule breaks',
  '  stack remove <stack>                    compose down, delete its folders, drop its row',
  '  doc add <path> "<what>"                 index a document under D:\\docs',
  '  doc status <path> <current|superseded|abandoned>',
].join('\n')

const rest = (parts: readonly string[], from: number) => parts.slice(from).join(' ')

const route = async (io: Io, c: Config, args: string): Promise<string> => {
  const t = tokens(args)
  const [area, action] = [t[0] ?? 'check', t[1] ?? '']
  switch (`${area} ${area === 'check' || area === 'clean' ? '' : action}`.trim()) {
    case 'check':
      return check(io, c)
    case 'clean':
      return action === 'apply' ? cleanApply(io, c, picks(t.slice(2))) : cleanPlan(io, c)
    case 'run new':
      return runNew(io, c, t[2] ?? '', t[3] ?? '', rest(t, 4))
    case 'run status':
      return runStatus(io, c, t[2] ?? '', t[3] ?? '', rest(t, 4))
    case 'run remove':
      return runRemove(io, c, t[2] ?? '')
    case 'stack new':
      return stackNew(io, c, t[2] ?? '', t[3] ?? '', t[4] ?? '', rest(t, 5))
    case 'stack sync':
      return stackSync(io, c, t[2])
    case 'stack remove':
      return stackRemove(io, c, t[2] ?? '')
    case 'doc add':
      return docAdd(io, c, t[2] ?? '', rest(t, 3))
    case 'doc status':
      return docStatus(io, c, t[2] ?? '', t[3] ?? '')
    default:
      return USAGE
  }
}

const answer = async (work: () => Promise<string>) => {
  try {
    return { text: await work(), isError: false }
  } catch (err) {
    return { text: (err as Error).message, isError: true }
  }
}

type Input = Record<string, unknown>
const str = (input: Input, key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '')

const TOOLS = [
  {
    name: 'testing_run',
    description:
      'Manage an isolated test run under D:\\testing: create its folder and manifest row, set its status, or remove it (stops processes and docker projects started from it, deletes the folder, drops the row). Use this instead of editing D:\\testing\\manifest.md or creating run folders by hand.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['new', 'status', 'remove'] },
        product: { type: 'string', description: 'product folder, e.g. timebase' },
        run: { type: 'string', description: 'run folder, named for what is under test, no date' },
        what: { type: 'string', description: 'new: what the run is' },
        status: { type: 'string', enum: ['running', 'done', 'abandoned'] },
        note: { type: 'string', description: 'status: what was kept or removed, appended after the status' },
      },
      required: ['action', 'product', 'run'],
    },
    run: (io: Io, c: Config, i: Input) => {
      const id = `${str(i, 'product')}/${str(i, 'run')}`
      if (i.action === 'new') return runNew(io, c, str(i, 'product'), str(i, 'run'), str(i, 'what'))
      if (i.action === 'status') return runStatus(io, c, id, str(i, 'status'), str(i, 'note'))
      if (i.action === 'remove') return runRemove(io, c, id)
      throw new Error('action must be new, status or remove')
    },
  },
  {
    name: 'docker_stack',
    description:
      'Manage a stack under D:\\docker: create its compose and volumes folders and manifest row (writes a skeleton compose.yml when none exists), sync the manifest ports from the compose files and report rule breaks, or remove a stack (compose down, delete both folders, drop the row). Use this instead of editing D:\\docker\\manifest.md by hand.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['new', 'sync', 'remove'] },
        tier: { type: 'string', enum: ['products', 'support'] },
        repo: { type: 'string', description: 'new: the repo (products) or thing (support), e.g. timebase, postgres' },
        slug: { type: 'string', description: 'new: two or three lowercase words, e.g. full-stack' },
        what: { type: 'string', description: 'new: what the stack gives you' },
        stack: { type: 'string', description: 'sync (optional) or remove: the stack name, <repo>-<slug>' },
      },
      required: ['action'],
    },
    run: (io: Io, c: Config, i: Input) => {
      if (i.action === 'new') return stackNew(io, c, str(i, 'tier'), str(i, 'repo'), str(i, 'slug'), str(i, 'what'))
      if (i.action === 'sync') return stackSync(io, c, str(i, 'stack') || undefined)
      if (i.action === 'remove') return stackRemove(io, c, str(i, 'stack'))
      throw new Error('action must be new, sync or remove')
    },
  },
  {
    name: 'docs_index',
    description:
      'Index a document under D:\\docs: add its manifest row as current once the file is written, or change its status (current, superseded, abandoned) and date. Use this instead of editing D:\\docs\\manifest.md by hand.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'status'] },
        path: { type: 'string', description: 'relative to D:\\docs, e.g. flow/timebase/topic/notes.md' },
        what: { type: 'string', description: 'add: what the document covers' },
        status: { type: 'string', enum: ['current', 'superseded', 'abandoned'] },
      },
      required: ['action', 'path'],
    },
    run: (io: Io, c: Config, i: Input) => {
      if (i.action === 'add') return docAdd(io, c, str(i, 'path'), str(i, 'what'))
      if (i.action === 'status') return docStatus(io, c, str(i, 'path'), str(i, 'status'))
      throw new Error('action must be add or status')
    },
  },
  {
    name: 'drive_check',
    description:
      'Report what is stale, untracked or misnamed across D:\\testing, D:\\docker and D:\\docs, and the cleanup it would take. Changes nothing; the person runs /drive clean to carry it out.',
    inputSchema: { type: 'object', properties: {} },
    run: (io: Io, c: Config) => check(io, c),
  },
] as const

const ioOf = ($: EngineInterface): Io => ({
  read: path => $.fs.read(path),
  write: (path, text) => $.fs.write(path, text),
  list: path => $.fs.list(path),
  stat: (path, options) => $.fs.stat(path, options),
  exists: path => $.fs.exists(path),
  run: (argv, init) => $.process.run(argv, init),
  now: () => $.clock.now(),
  storeGet: key => $.store.get(key),
  storeSet: (key, value) => $.store.set(key, value),
  storeDelete: key => $.store.delete(key),
})

const start = async ($: EngineInterface, c: Config) => {
  await $.command.register({
    name: 'drive',
    description: 'Manage and clean D:\\testing, D:\\docker and D:\\docs by their manifests',
    argumentHint: '[check | clean [apply] | run ... | stack ... | doc ...]',
  })
  for (const tool of TOOLS) {
    await $.tool.register({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })
  }
  if (c.nudge) {
    $.clock.after(3000, () => {
      void staleCount(ioOf($), c)
        .then(n => {
          if (!n.total) return
          const parts = (['testing', 'docker', 'docs'] as const).filter(a => n[a]).map(a => `${a} ${n[a]}`)
          $.ui.toast(`drive: ${n.total} to clean (${parts.join(', ')}). /drive clean`)
        })
        .catch(() => undefined)
    })
  }
}

// Hand edits of a manifest go through the tools instead, so a row and its folder move together.
const guard = async ($: EngineInterface, c: Config, path: string) => {
  const real = (await $.fs.stat(path, { resolve: true }).catch(() => undefined))?.realPath ?? path
  const hit = (['testing', 'docker', 'docs'] as const).find(a => {
    const m = manifestOf(c, a)
    return samePath(slash(real), m) || samePath(slash(path), m)
  })
  if (!hit) return undefined
  const tool = { testing: 'testing_run', docker: 'docker_stack', docs: 'docs_index' }[hit]
  return `${manifestOf(c, hit)} is kept by the rr-mods drive mod. Use the ${tool} tool (or /drive) so the row and its folder change together.`
}

export const register: Register = (on, options) => {
  const c = configOf(options)

  on('session.start', async ($, e, next) => {
    await start($, c)
    return next(e)
  })

  on('command.run', { command: 'drive' }, async ($, e) => {
    const { text } = await answer(() => route(ioOf($), c, e.args))
    return { text }
  })

  for (const tool of TOOLS) {
    on('tool.call', { tool: `mcp__rr-mods__${tool.name}` }, async ($, e) => {
      const { text, isError } = await answer(() => tool.run(ioOf($), c, e as unknown as Input))
      return isError ? { deny: text } : { result: text }
    })
  }

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const deny = await guard($, c, e.file_path)
    return deny ? { deny } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'rr-mods: the manifest guard failed.' }))

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const deny = await guard($, c, e.file_path)
    return deny ? { deny } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'rr-mods: the manifest guard failed.' }))
}
