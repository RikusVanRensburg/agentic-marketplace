import type { On, RenderElement } from 'claude-code'
import { expect, test, type Engine } from 'claude-code/testing'

import { afterClean } from '../hooks/working'

// The working branch: picked in the band from the org folder or a repo root, or taken from the
// worktree the session opened in; followed by creates and housekeeping, and told to the model.
// Git answers from a script that knows two repos under D:/org; every command run is recorded.

const SITE = { plugin: 'worktree-lifecycle', viewport: { columns: 100, rows: 30 } } as const
const STOCK: RenderElement = { type: 'Text', props: {}, children: [''] }

const band = {
  ...SITE,
  surface: 'desktop',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

type World = { cwd: string; trees: Record<string, string[]>; local: Record<string, string[]>; remote: Record<string, string[]>; ran: string[]; appended: string[] }

const answer = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

function stub(on: On, world: World) {
  const rootOf = (path: string) => /^D:\/org\/[^/]+/.exec(path.replace(/\\/g, '/'))?.[0] ?? null

  on('session.cwd', () => ({ value: world.cwd }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', () => STOCK)
  on('session.append', ($, e, next) => {
    const content = e.message.content
    const block = Array.isArray(content) ? content[0] : undefined
    if (block !== undefined && typeof block === 'object' && 'text' in block) world.appended.push(String(block.text))
    return next(e)
  })
  on('fs.exists', ($, e) => ({ value: /^D:\/org\/(alpha|beta)\/\.bare$/.test(e.path.replace(/\\/g, '/')) }))
  on('fs.list', ($, e) => ({
    value: e.path.replace(/\\/g, '/') === 'D:/org' ? ['alpha', 'beta', 'notes'].map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })) : [],
  }))
  on('process.run', ($, e) => {
    const line = e.argv.join(' ')
    world.ran.push(line)
    const at = e.argv[1] === '-C' ? (e.argv[2] ?? '') : (e.init?.cwd ?? world.cwd)
    const root = rootOf(at)
    const trees = root === null ? [] : (world.trees[root] ?? [])

    if (/--git-dir --git-common-dir/.test(line)) {
      if (root === null) return answer('', 128)
      const branch = trees.find(one => at.replace(/\\/g, '/') === `${root}/${one}` || at.replace(/\\/g, '/').startsWith(`${root}/${one}/`))
      return answer(branch === undefined ? `${root}/.bare\n${root}/.bare\n` : `${root}/.bare/worktrees/x\n${root}/.bare\n`)
    }
    if (/--git-common-dir/.test(line)) return root === null ? answer('', 128) : answer(`${root}/.bare\n`)
    if (/symbolic-ref --quiet --short HEAD/.test(line)) {
      const branch = trees.find(one => at.replace(/\\/g, '/').startsWith(`${root}/${one}`))
      return branch === undefined ? answer('', 1) : answer(`${branch}\n`)
    }
    if (/worktree list --porcelain/.test(line)) {
      return answer([`worktree ${root}/.bare\nbare\n`, ...trees.map(one => `worktree ${root}/${one}\nHEAD a\nbranch refs/heads/${one}\n`)].join('\n'))
    }
    if (/for-each-ref/.test(line)) {
      const local = root === null ? [] : (world.local[root] ?? [])
      const remote = root === null ? [] : (world.remote[root] ?? [])
      return answer([...local.map(one => `refs/heads/${one}`), ...remote.map(one => `refs/remotes/origin/${one}`)].join('\n'))
    }
    if (/rev-parse --verify --quiet refs\/heads\//.test(line)) {
      const name = line.slice(line.indexOf('refs/heads/') + 'refs/heads/'.length)
      return (world.local[root ?? ''] ?? []).includes(name) ? answer('abc\n') : answer('', 1)
    }
    if (/rev-parse --verify --quiet refs\/remotes\/origin\//.test(line)) {
      const name = line.slice(line.indexOf('refs/remotes/origin/') + 'refs/remotes/origin/'.length)
      return (world.remote[root ?? ''] ?? []).includes(name) ? answer('abc\n') : answer('', 1)
    }
    if (/config user.name/.test(line)) return answer('Rikus van Rensburg\n')
    if (/ worktree add /.test(line)) {
      const branch = e.argv[e.argv.indexOf('-b') + 1] ?? ''
      world.trees[root ?? ''] = [...trees, branch]
      world.local[root ?? ''] = [...(world.local[root ?? ''] ?? []), branch]
      return answer('')
    }

    return answer('')
  })
}

function world(cwd: string): World {
  return {
    cwd,
    trees: { 'D:/org/alpha': ['main'], 'D:/org/beta': ['dev'] },
    local: { 'D:/org/alpha': ['main', 'release'], 'D:/org/beta': ['dev'] },
    remote: { 'D:/org/alpha': ['main', 'release', 'old/spike'], 'D:/org/beta': ['dev'] },
    ran: [],
    appended: [],
  }
}

async function start($: Engine) {
  await $.command.run({ command: 'wt', args: 'status', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
}

const options = (found: { props: Record<string, unknown> } | undefined) =>
  ((found?.props.options ?? []) as { value: string; label?: string }[]).map(one => one.label ?? one.value)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: from the org folder, pick a repo then a branch, and the band folds to one dropdown`, async ($, on) => {
    const w = world('D:/org')
    stub(on, w)
    await start($)
    const ui = await $.ui.mount({ ...band, surface })

    expect(options(await ui.find({ type: 'Select', key: 'repo' }))).toEqual(['Choose a repo', 'alpha', 'beta'])
    expect(await ui.find({ type: 'Select', key: 'branch' })).toBeUndefined()

    await ui.select({ key: 'repo', value: 'D:/org/alpha' })
    expect(options(await ui.find({ type: 'Select', key: 'branch' }))).toEqual(['Choose a branch', 'main', 'release, no worktree'])

    await ui.select({ key: 'branch', value: 'main' })
    const working = await ui.find({ type: 'Select', key: 'working' })

    expect(working?.props.value).toBe('main')
    expect(working?.props.label).toBe('alpha ')
    expect(options(working)).toEqual(['main', 'Other branch...', 'Other repo...'])
    expect(await ui.find({ type: 'Select', key: 'branch' })).toBeUndefined()
    expect(w.appended).toEqual(['[worktree-lifecycle] The person set the working environment: alpha on main, worktree D:/org/alpha/main.'])
  })
}

test('the model is told the working branch in the system prompt', async ($, on) => {
  const w = world('D:/org/beta/dev')
  stub(on, w)
  on('prompt.compose', () => ({ sections: [] }))
  await start($)

  const composed = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: [], tools: [], outputStyle: null, traits: [] })
  const section = composed.sections.find(one => one.id === 'worktree-lifecycle:working')

  expect(section?.scope).toBe('session')
  expect(section?.text).toMatch(/Make changes in D:\/org\/beta\/dev \(branch dev\), by path\./)
})

test('opened inside a worktree, that worktree is the working branch and no picker shows', async ($, on) => {
  const w = world('D:/org/beta/dev')
  stub(on, w)
  await start($)
  const ui = await $.ui.mount(band)

  const working = await ui.find({ type: 'Select', key: 'working' })
  expect(working?.props.value).toBe('dev')
  expect(options(working)).toEqual(['dev', 'Other branch...'])
  expect(await ui.find({ type: 'Select', key: 'branch' })).toBeUndefined()
  expect(w.appended).toEqual([])
})

test('a worktree created in the working repo is cut from the working branch and becomes it', async ($, on) => {
  const w = world('D:/org')
  stub(on, w)
  await start($)
  const ui = await $.ui.mount(band)
  await ui.select({ key: 'repo', value: 'D:/org/alpha' })
  await ui.select({ key: 'branch', value: 'release' })

  const result = await $.tool.call({ tool: 'mcp__worktree-lifecycle__worktree_new' as never, type: 'feat', slug: 'x' } as never)

  expect(JSON.stringify(result)).toMatch(/Created feat\/RVR\/x at D:\/org\/alpha\/feat\/RVR\/x, cut from release/)
  expect(w.ran).toContain('git -C D:/org/alpha worktree add --no-track -b feat/RVR/x D:/org/alpha/feat/RVR/x release')

  const working = await ui.find({ type: 'Select', key: 'working' })
  expect(working?.props.value).toBe('feat/RVR/x')
  expect(options(working)).toEqual(['main', 'feat/RVR/x', 'Other branch...', 'Other repo...'])
})

test('Other branch reopens the picker; Keep goes back, a typed origin branch is taken, an unknown one is said', async ($, on) => {
  const w = world('D:/org/alpha')
  stub(on, w)
  await start($)
  const ui = await $.ui.mount(band)

  expect(await ui.find({ type: 'Select', key: 'repo' })).toBeUndefined()
  await ui.select({ key: 'branch', value: 'main' })

  await ui.select({ key: 'working', value: ':branch' })
  expect(await ui.find({ type: 'Button', text: 'Keep main' })).toBeDefined()
  await ui.press({ key: 'keep' })
  expect((await ui.find({ type: 'Select', key: 'working' }))?.props.value).toBe('main')

  await ui.select({ key: 'working', value: ':branch' })
  await ui.input({ key: 'branch-name', text: 'nope' })
  expect(await ui.find({ type: 'Text', text: 'There is no branch nope in alpha, locally or on origin.' })).toBeDefined()

  await ui.input({ key: 'branch-name', text: 'old/spike' })
  const working = await ui.find({ type: 'Select', key: 'working' })
  expect(working?.props.value).toBe('old/spike')
  expect(options(working)).toEqual(['old/spike, no worktree', 'main', 'Other branch...'])
  expect(w.appended.at(-1)).toBe('[worktree-lifecycle] The person set the working environment: alpha on old/spike, which has no worktree yet.')
})

test('housekeeping the working branch hands over to its base; any other branch changes nothing', () => {
  const working = { root: 'D:/org/alpha', branch: 'feat/RVR/x', path: 'D:/org/alpha/feat/RVR/x', base: 'main' }
  const scope = { org: null, repos: [], root: 'D:/org/alpha', branches: [], working, isPicking: false, note: null }

  expect(afterClean(scope, { branch: 'feat/RVR/x', base: 'main', baseWorktree: 'D:/org/alpha/main' }).working).toEqual({
    root: 'D:/org/alpha',
    branch: 'main',
    path: 'D:/org/alpha/main',
    base: null,
  })
  expect(afterClean(scope, { branch: 'fix/RVR/y', base: 'main', baseWorktree: null })).toBe(scope)
})

test('a folder holding no repos leaves the band to the engine', async ($, on) => {
  const w = world('D:/elsewhere')
  stub(on, w)
  await start($)
  const ui = await $.ui.mount(band)

  expect(await ui.find({ type: 'Select' })).toBeUndefined()
})
