import type { On, RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'

// Shipping through the model's tool: it only prepares, and the press in the band is what
// pushes. Git and gh answer from a script; every command run is recorded.

const SITE = { plugin: 'worktree-lifecycle', viewport: { columns: 100, rows: 30 } } as const
const STOCK: RenderElement = { type: 'Text', props: {}, children: [''] }
const PORCELAIN = 'worktree D:/r/.bare\nbare\n\nworktree D:/r/main\nHEAD a\nbranch refs/heads/main\n\nworktree D:/r/feat/RVR/x\nHEAD b\nbranch refs/heads/feat/RVR/x\n'

const band = {
  ...SITE,
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

function stub(on: On, ran: string[]) {
  const answers: [RegExp, string][] = [
    [/--git-common-dir/, 'D:/r/.bare\n'],
    [/worktree list --porcelain/, PORCELAIN],
    [/status --porcelain/, ''],
    [/config --get-regexp/, 'branch.feat/RVR/x.lifecycleowner worktree-lifecycle\nbranch.feat/RVR/x.lifecyclebase main\n'],
    [/rev-list --count/, '2\n'],
    [/log -1 --format=%s/, 'feat: add x\n'],
    [/log --reverse/, '- feat: add x\n- fix: tidy\n'],
    [/^gh pr list/, ''],
    [/^gh pr create/, 'https://github.com/o/r/pull/7\n'],
  ]

  on('session.cwd', () => ({ value: 'D:/r/main' }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', () => STOCK)
  on('process.run', ($, e) => {
    const line = e.argv.join(' ')
    ran.push(line)
    const answer = answers.find(([pattern]) => pattern.test(line))

    return { value: { exitCode: 0, stdout: answer?.[1] ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
}

test('the ship tool waits for the press, and the press pushes and opens a draft PR', async ($, on) => {
  const ran: string[] = []
  stub(on, ran)

  const result = await $.tool.call({ tool: 'mcp__worktree-lifecycle__worktree_ship', branch: 'feat/RVR/x' })
  expect(String(result.result)).toMatch(/Nothing is pushed until the person presses/)
  expect(ran.some(line => / push /.test(line))).toBe(false)

  const ui = await $.ui.mount(band)
  expect(await ui.find({ type: 'Text', text: /Ship feat\/RVR\/x\?/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Draft PR into main: feat: add x/ })).toBeDefined()

  await ui.press({ key: 'confirm' })

  expect(ran).toContain('git -C D:/r/feat/RVR/x push -u origin feat/RVR/x')
  expect(ran).toContain('git -C D:/r fetch --no-prune origin main')
  expect(ran.find(line => line.startsWith('gh pr create'))).toMatch(/--base main --head feat\/RVR\/x --title feat: add x --body-file - --draft/)
})

test('Later drops the offer and runs nothing', async ($, on) => {
  const ran: string[] = []
  stub(on, ran)

  await $.tool.call({ tool: 'mcp__worktree-lifecycle__worktree_ship', branch: 'feat/RVR/x', isReady: true })
  const ui = await $.ui.mount(band)
  expect(await ui.find({ type: 'Button', text: 'Push and open PR' })).toBeDefined()

  await ui.press({ key: 'later' })

  expect(ran.some(line => / push /.test(line))).toBe(false)
  expect(await ui.find({ type: 'Button', key: 'confirm' })).toBeUndefined()
})

test('another plugin running /wt ship gets the band, not a push', async ($, on) => {
  const ran: string[] = []
  stub(on, ran)

  const result = await $.command.run({
    command: 'wt',
    args: 'ship feat/RVR/x',
    origin: { kind: 'plugin', name: 'someone-else' },
    presentation: { isFullscreen: false, columns: 100 },
  })

  expect(result.text).toMatch(/Waiting for the person's yes/)
  expect(ran.some(line => / push /.test(line))).toBe(false)
})
