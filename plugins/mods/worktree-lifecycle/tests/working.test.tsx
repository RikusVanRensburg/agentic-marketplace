import type { On, RenderElement } from 'claude-code'
import { expect, test, type Engine } from 'claude-code/testing'

import { afterClean } from '../hooks/working'

// The working branch: taken from the worktree the session opened in, followed by creates and
// housekeeping, and told to the model. Git answers from a script that knows two repos under
// D:/org; every command run is recorded.

const STOCK: RenderElement = { type: 'Text', props: {}, children: [''] }

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

const compose = ($: Engine) =>
  $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: [], tools: [], outputStyle: null, traits: [] })

const workingSection = async ($: Engine) => (await compose($)).sections.find(one => one.id === 'worktree-lifecycle:working')

test('opened inside a worktree, the model is told that worktree is the working branch', async ($, on) => {
  const w = world('D:/org/beta/dev')
  stub(on, w)
  on('prompt.compose', () => ({ sections: [] }))
  await start($)

  const section = await workingSection($)

  expect(section?.scope).toBe('session')
  expect(section?.text).toMatch(/Make changes in D:\/org\/beta\/dev \(branch dev\), by path\./)
})

test('opened on an org folder, there is no working branch to tell', async ($, on) => {
  const w = world('D:/org')
  stub(on, w)
  on('prompt.compose', () => ({ sections: [] }))
  await start($)

  expect(await workingSection($)).toBeUndefined()
})

test('a worktree created in the working repo is cut from the working branch and becomes it', async ($, on) => {
  const w = world('D:/org/alpha/main')
  stub(on, w)
  on('prompt.compose', () => ({ sections: [] }))
  await start($)

  const result = await $.tool.call({ tool: 'mcp__worktree-lifecycle__worktree_new' as never, type: 'feat', slug: 'x' } as never)

  expect(JSON.stringify(result)).toMatch(/Created feat\/RVR\/x at D:\/org\/alpha\/feat\/RVR\/x, cut from main/)
  expect(w.ran).toContain('git -C D:/org/alpha worktree add --no-track -b feat/RVR/x D:/org/alpha/feat/RVR/x main')
  expect((await workingSection($))?.text).toMatch(/Make changes in D:\/org\/alpha\/feat\/RVR\/x \(branch feat\/RVR\/x, cut from main\)/)
})

test('housekeeping the working branch hands over to its base; any other branch changes nothing', () => {
  const working = { root: 'D:/org/alpha', branch: 'feat/RVR/x', path: 'D:/org/alpha/feat/RVR/x', base: 'main' }
  const scope = { org: null, repos: [], root: 'D:/org/alpha', branches: [], working }

  expect(afterClean(scope, { branch: 'feat/RVR/x', base: 'main', baseWorktree: 'D:/org/alpha/main' }).working).toEqual({
    root: 'D:/org/alpha',
    branch: 'main',
    path: 'D:/org/alpha/main',
    base: null,
  })
  expect(afterClean(scope, { branch: 'fix/RVR/y', base: 'main', baseWorktree: null })).toBe(scope)
})
