import { describe, expect, test } from 'claude-code/testing'

import type { PromptOrigin } from 'claude-code'

import { route } from '../hooks/command'
import type { Io, Repo } from '../hooks/gh'
import { applyConsolidate, configOf, create, ensureLabels, familyOf, fill, link, PLAN_KEY, PLAN_MS, planConsolidate } from '../hooks/ops'

// ---- a fake gh: rules answer by matching the command line; every call is kept

type Rule = [RegExp, string | { stdout?: string; exitCode?: number; stderr?: string }]
type Call = { line: string; stdin?: string }

const R: Repo = { owner: 'acme', name: 'app', slug: 'acme/app' }
const NOW = Date.parse('2026-10-14T12:00:00Z')

const fakeIo = (rules: Rule[]) => {
  const calls: Call[] = []
  const store = new Map<string, unknown>()
  let now = NOW
  const io: Io = {
    run: async (argv, init) => {
      const line = argv.join(' ')
      calls.push({ line, stdin: init?.stdin })
      const hit = rules.find(([re]) => re.test(line))?.[1] ?? ''
      const a = typeof hit === 'string' ? { stdout: hit } : hit
      return { exitCode: a.exitCode ?? 0, stdout: a.stdout ?? '', stderr: a.stderr ?? '' }
    },
    now: async () => now,
    storeGet: async key => store.get(key),
    storeSet: async (key, value) => void store.set(key, value),
    storeDelete: async key => void store.delete(key),
  }
  return { io, calls, store, advance: (ms: number) => (now += ms) }
}

const view = (o: { number: number; labels?: string[]; assignees?: string[]; type?: string; milestone?: string; title?: string }) =>
  JSON.stringify({
    number: o.number,
    title: o.title ?? `issue ${o.number}`,
    url: `https://github.com/acme/app/issues/${o.number}`,
    state: 'OPEN',
    labels: (o.labels ?? []).map(name => ({ name })),
    assignees: (o.assignees ?? []).map(login => ({ login })),
    type: o.type ? { name: o.type } : null,
    milestone: o.milestone ? { title: o.milestone } : null,
  })

const LABELS = 'type: feat\ntype: fix\nscope: api\nduplicate\n'
const TYPES = 'Task\nBug\nFeature\n'
const changes = (calls: Call[]) => calls.filter(c => / issue (create|edit|comment|close) | label create /.test(c.line))

const BASE = {
  title: 'Add export',
  body: '## Problem\n\nx',
  labels: [] as string[],
  blockedBy: [] as number[],
  blocking: [] as number[],
}

// ---- create

describe('issue_create', () => {
  test('a label the repo lacks stops it before anything is created', async () => {
    const { io, calls } = fakeIo([[/label list/, LABELS]])
    await expect(create(io, R, { ...BASE, labels: ['type: feat', 'scope: web'] })).rejects.toThrow(/not labels in acme\/app: scope: web/)
    expect(changes(calls)).toEqual([])
  })

  test('every field goes on one create, the body by stdin, and each is read back', async () => {
    const { io, calls } = fakeIo([
      [/label list/, LABELS],
      [/orgs\/acme\/issue-types/, TYPES],
      [/milestones/, 'v1\nv2\n'],
      [/issue create/, 'https://github.com/acme/app/issues/42\n'],
      [/issue view 42/, view({ number: 42, labels: ['type: feat', 'scope: api'], assignees: ['rr'], type: 'Feature', milestone: 'v1' })],
      [/issues\/7\/sub_issues/, '5\n42\n'],
      [/repos\/acme\/app\/issues\/42 /, '{"blocked_by":2,"blocking":0}'],
    ])
    const text = await create(io, R, {
      ...BASE,
      labels: ['type: feat', 'scope: api'],
      type: 'feature',
      assignee: '@me',
      parent: 7,
      blockedBy: [3, 4],
      milestone: 'v1',
    })
    const made = calls.find(c => / issue create /.test(c.line))
    expect(made?.line).toContain('-R acme/app')
    expect(made?.line).toContain('--label type: feat --label scope: api')
    expect(made?.line).toContain('--type Feature')
    expect(made?.line).toContain('--parent 7')
    expect(made?.line).toContain('--blocked-by 3,4')
    expect(made?.stdin).toBe(BASE.body)
    expect(text).toMatch(/Created #42/)
    expect(text).toMatch(/parent: #7, link verified/)
    expect(text).toMatch(/blocked by 2, blocking 0, verified/)
  })

  test('a parent link that did not attach is an error naming the created issue', async () => {
    const { io } = fakeIo([
      [/issue create/, 'https://github.com/acme/app/issues/42\n'],
      [/issue view 42/, view({ number: 42 })],
      [/issues\/7\/sub_issues/, '5\n'],
    ])
    await expect(create(io, R, { ...BASE, parent: 7 })).rejects.toThrow(/Created #42[\s\S]*LINK MISSING: #42 is not a sub-issue of #7/)
  })

  test('an org without issue types gets no --type and a note', async () => {
    const { io, calls } = fakeIo([
      [/orgs\/acme\/issue-types/, { exitCode: 1, stderr: 'HTTP 404' }],
      [/issue create/, 'https://github.com/acme/app/issues/9\n'],
      [/issue view 9/, view({ number: 9 })],
    ])
    const text = await create(io, R, { ...BASE, type: 'Task' })
    expect(calls.find(c => / issue create /.test(c.line))?.line).not.toContain('--type')
    expect(text).toMatch(/acme has no native issue types, left off/)
  })

  test('a type the org lacks and a missing milestone are refused before creating', async () => {
    const { io, calls } = fakeIo([
      [/orgs\/acme\/issue-types/, TYPES],
      [/milestones/, ''],
    ])
    await expect(create(io, R, { ...BASE, type: 'Epic' })).rejects.toThrow(/not one of acme's issue types/)
    await expect(create(io, R, { ...BASE, milestone: 'v9' })).rejects.toThrow(/never created/)
    expect(changes(calls)).toEqual([])
  })
})

// ---- fill

describe('issue_fill', () => {
  test('fills only the blanks and reports what was already there', async () => {
    let filled = false
    const { io, calls } = fakeIo([
      [/label list/, LABELS],
      [/orgs\/acme\/issue-types/, TYPES],
      [/issue edit/, ''],
    ])
    const before = view({ number: 5, labels: ['type: fix'], assignees: ['zed'] })
    const after = view({ number: 5, labels: ['type: fix', 'scope: api'], assignees: ['zed'], type: 'Bug' })
    io.run = (orig => async (argv, init) => {
      const line = argv.join(' ')
      if (/issue view 5/.test(line)) {
        calls.push({ line })
        const out = filled ? after : before
        filled = true
        return { exitCode: 0, stdout: out, stderr: '' }
      }
      return orig(argv, init)
    })(io.run)

    const text = await fill(io, R, 5, { labels: ['type: feat', 'scope: api'], type: 'bug', assignee: '@me' })
    const edits = calls.filter(c => / issue edit /.test(c.line)).map(c => c.line)
    expect(edits.some(l => l.includes('--add-assignee'))).toBe(false)
    expect(edits.some(l => l.includes('--add-label scope: api'))).toBe(true)
    expect(edits.some(l => l.includes('type: feat'))).toBe(false)
    expect(edits.some(l => l.includes('--type Bug'))).toBe(true)
    expect(text).toMatch(/assignee: already zed/)
    expect(text).toMatch(/label: type: fix already there, type: feat left off/)
    expect(text).toMatch(/type: filled with Bug/)
  })

  test('a label the repo lacks changes nothing, the body included', async () => {
    const { io, calls } = fakeIo([
      [/label list/, LABELS],
      [/issue view 5/, view({ number: 5 })],
    ])
    await expect(fill(io, R, 5, { body: 'new', labels: ['scope: web'] })).rejects.toThrow(/not labels/)
    expect(changes(calls)).toEqual([])
  })
})

// ---- link

describe('issue_link', () => {
  test('links the missing children, skips the linked, and checks the set', async () => {
    let listed = '3\n'
    const { io, calls } = fakeIo([])
    io.run = (orig => async (argv, init) => {
      const line = argv.join(' ')
      if (/sub_issues/.test(line)) {
        calls.push({ line })
        const out = listed
        listed = '3\n4\n5\n'
        return { exitCode: 0, stdout: out, stderr: '' }
      }
      return orig(argv, init)
    })(io.run)
    const text = await link(io, R, 1, [3, 4, 5])
    expect(calls.filter(c => /--add-sub-issue/.test(c.line)).map(c => c.line.split(' ').pop())).toEqual(['4', '5'])
    expect(calls.find(c => /sub_issues/.test(c.line))?.line).toContain('--paginate')
    expect(text).toMatch(/3 verified as sub-issues of #1 \(2 linked now, 1 already there\)/)
  })

  test('a child missing after linking is an error', async () => {
    const { io } = fakeIo([[/sub_issues/, '3\n']])
    await expect(link(io, R, 1, [3, 4])).rejects.toThrow(/LINK MISSING under #1: #4/)
  })
})

// ---- labels

describe('label_ensure', () => {
  const c = configOf({})

  test('the shared families are refused', async () => {
    const { io, calls } = fakeIo([[/label list/, LABELS]])
    await expect(ensureLabels(io, R, c, ['run:map', 'state: done'], 'x')).rejects.toThrow(/state: done/)
    expect(changes(calls)).toEqual([])
  })

  test('only missing labels are created', async () => {
    const { io, calls } = fakeIo([[/label list/, 'run:map\n']])
    const text = await ensureLabels(io, R, c, ['run:map', 'run:task'], 'run tickets')
    expect(changes(calls).map(x => x.line)).toEqual(['gh label create run:task -R acme/app --color 1D76DB --description run tickets'])
    expect(text).toBe('created: run:task\nalready there: run:map')
  })

  test('families are read up to the colon', () => {
    expect(familyOf('type: feat')).toBe('type:')
    expect(familyOf('run:map')).toBe('run:')
    expect(familyOf('duplicate')).toBeUndefined()
  })
})

// ---- consolidate

describe('consolidate', () => {
  const issues: Rule[] = [
    [/issue view 10/, view({ number: 10, title: 'Export CSV' })],
    [/issue view 11/, view({ number: 11, title: 'CSV export' })],
    [/label list/, LABELS],
  ]
  const person = { kind: 'composer' } as PromptOrigin
  const plugin = { kind: 'plugin' } as unknown as PromptOrigin

  test('planning changes nothing on GitHub and stores the plan', async () => {
    const { io, calls, store } = fakeIo(issues)
    const text = await planConsolidate(io, R, 10, 11, 'repro steps')
    expect(changes(calls)).toEqual([])
    expect(store.get(PLAN_KEY)).toMatchObject({ repo: 'acme/app', survivor: 10, loser: 11 })
    expect(text).toMatch(/\/issues consolidate/)
  })

  test('applying carries over, cross-links, labels and closes, in that order', async () => {
    const { io, calls } = fakeIo(issues)
    await planConsolidate(io, R, 10, 11, 'repro steps')
    const text = await route(io, 'consolidate', person)
    expect(changes(calls).map(c => c.line.split(' -R')[0])).toEqual([
      'gh issue comment 10',
      'gh issue comment 10',
      'gh issue comment 11',
      'gh issue edit 11',
      'gh issue close 11',
    ])
    expect(calls.find(c => /issue close 11/.test(c.line))?.line).toContain('--reason not planned')
    expect(text).toMatch(/kept #10, closed #11/)
  })

  test('only the person typing it carries it out', async () => {
    const { io, calls } = fakeIo(issues)
    await planConsolidate(io, R, 10, 11, '')
    await expect(route(io, 'consolidate', plugin)).rejects.toThrow(/only the person/)
    expect(changes(calls)).toEqual([])
  })

  test('a plan over an hour old is dropped', async () => {
    const { io, calls, advance } = fakeIo(issues)
    await planConsolidate(io, R, 10, 11, '')
    advance(PLAN_MS + 1)
    expect(await route(io, 'consolidate', person)).toMatch(/Nothing planned/)
    expect(changes(calls)).toEqual([])
  })

  test('a failed step is reported as partial, naming what was done', async () => {
    const { io } = fakeIo([[/issue close/, { exitCode: 1, stderr: 'HTTP 403' }], ...issues])
    await planConsolidate(io, R, 10, 11, '')
    await expect(applyConsolidate(io, R, (await io.storeGet(PLAN_KEY)) as never)).rejects.toThrow(
      /Partial: done cross-link, duplicate label; stopped at close: gh issue close: HTTP 403/,
    )
  })
})
