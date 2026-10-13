import { describe, expect, test } from 'claude-code/testing'

import type { FsEntry, ProcessRunInit, ProcessRunResult } from 'claude-code'

import type { Config, Io } from '../hooks/drive/io'
import {
  composeProblems,
  DAY_MS,
  formatPorts,
  nameProblem,
  parseComposeLs,
  parseDockerPs,
  parsePorts,
  picks,
  plan,
  portClashes,
  readComposeConfig,
  slugProblem,
  statusWord,
  tokens,
} from '../hooks/drive/model'
import { check, cleanApply, cleanPlan, docAdd, docStatus, runNew, runRemove, runStatus, stackNew } from '../hooks/drive/ops'
import { parseTable, renderTable } from '../hooks/drive/table'

// ---- a fake disk

const NOW = Date.parse('2026-10-13T12:00:00Z')

const key = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

const fakeIo = (files: Record<string, string>, opts: { mtimes?: Record<string, number>; docker?: { ls?: string; ps?: string } } = {}) => {
  const disk = new Map<string, { path: string; text?: string; mtimeMs: number }>()
  const addDir = (path: string, mtimeMs = NOW) => {
    const parts = path.replace(/\\/g, '/').split('/')
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/')
      if (!disk.has(key(p))) disk.set(key(p), { path: p, mtimeMs })
    }
  }
  for (const [path, text] of Object.entries(files)) {
    addDir(path.slice(0, path.lastIndexOf('/')))
    disk.set(key(path), { path, text, mtimeMs: NOW })
  }
  for (const [path, ms] of Object.entries(opts.mtimes ?? {})) {
    addDir(path)
    disk.get(key(path))!.mtimeMs = ms
  }
  const calls: string[] = []
  const store = new Map<string, unknown>()
  const result = (stdout = '', exitCode = 0): ProcessRunResult => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  const io: Io = {
    read: async p => {
      const f = disk.get(key(p))
      if (f?.text === undefined) throw new Error(`ENOENT ${p}`)
      return f.text
    },
    write: async (p, text) => {
      addDir(p.slice(0, p.lastIndexOf('/')))
      disk.set(key(p), { path: p, text, mtimeMs: NOW })
    },
    list: async p => {
      const base = key(p) + '/'
      const out: FsEntry[] = []
      for (const [k, f] of disk) {
        if (!k.startsWith(base) || k.slice(base.length).includes('/')) continue
        out.push({ name: f.path.slice(f.path.lastIndexOf('/') + 1), kind: f.text === undefined ? 'dir' : 'file', size: 0, mtimeMs: f.text === undefined ? 0 : f.mtimeMs, isLink: false })
      }
      return out
    },
    stat: async p => {
      const f = disk.get(key(p))
      if (!f) throw new Error(`ENOENT ${p}`)
      return { kind: f.text === undefined ? 'dir' : 'file', size: 0, mtimeMs: f.mtimeMs, isLink: false }
    },
    exists: async p => disk.has(key(p)),
    run: async (argv: readonly string[], init?: ProcessRunInit) => {
      const target = init?.env?.DRIVE_PATH ?? ''
      calls.push(`${argv[0]} ${argv[0] === 'powershell' ? argv[4]!.split(' ')[0] : argv.slice(1).join(' ')} ${target}`.trim())
      if (argv[0] === 'powershell' && argv[4]!.startsWith('Remove-Item')) {
        for (const k of [...disk.keys()]) if (k === key(target) || k.startsWith(key(target) + '/')) disk.delete(k)
      } else if (argv[0] === 'powershell' && argv[4]!.startsWith('New-Item')) {
        addDir(target.replace(/\\/g, '/'))
      } else if (argv[0] === 'docker' && argv[2] === 'ls') {
        return result(opts.docker?.ls ?? '[]')
      } else if (argv[0] === 'docker' && argv[1] === 'ps') {
        return result(opts.docker?.ps ?? '')
      }
      return result()
    },
    now: async () => NOW,
    storeGet: async k => store.get(k),
    storeSet: async (k, v) => void store.set(k, v),
    storeDelete: async k => void store.delete(k),
  }
  return { io, disk, calls, text: (p: string) => disk.get(key(p))?.text }
}

const C: Config = { root: 'D:', staleDays: 7, nudge: false }

const TESTING = [
  '# D:\\testing',
  '',
  '| run | path | what it is | status |',
  '|---|---|---|---|',
  '| old | timebase\\old | finished run | done: logs kept |',
  '| live | timebase\\live | still going | running |',
  '| idle | timebase\\idle | forgotten | running |',
  '| ghost | timebase\\ghost | folder gone | running |',
  '',
].join('\n')

const DOCKER = [
  '# D:\\docker stacks',
  '',
  '| stack | what it gives you | ports | file |',
  '|---|---|---|---|',
  '| timebase-full-stack | the 7 hosts | 4511-4572 | compose/products/timebase/full-stack/compose.yml |',
  '| timebase-gone-stack | lost | 4600 | compose/products/timebase/gone-stack/compose.yml |',
  '',
].join('\n')

const DOCS = [
  '# D:\\docs',
  '',
  '| document | what it covers | status | updated |',
  '|---|---|---|---|',
  '| [flow/timebase/a/one.md](flow/timebase/a/one.md) | one | current | 2026-09-01 |',
  '| [flow/timebase/a/two.md](flow/timebase/a/two.md) | two | superseded | 2026-09-01 |',
  '| [flow/timebase/a/gone.md](flow/timebase/a/gone.md) | gone | current | 2026-09-01 |',
  '',
].join('\n')

const drive = () =>
  fakeIo(
    {
      'D:/testing/manifest.md': TESTING,
      'D:/testing/timebase/old/log.txt': 'x',
      'D:/testing/timebase/live/log.txt': 'x',
      'D:/testing/timebase/stray/log.txt': 'x',
      'D:/docker/manifest.md': DOCKER,
      'D:/docker/compose/products/timebase/full-stack/compose.yml': 'name: timebase-full-stack',
      'D:/docker/volumes/products/timebase/full-stack/pulse/data.db': 'x',
      'D:/docker/volumes/products/timebase/orphan-data/pulse/data.db': 'x',
      'D:/docs/manifest.md': DOCS,
      'D:/docs/flow/timebase/a/one.md': '1',
      'D:/docs/flow/timebase/a/two.md': '2',
      'D:/docs/flow/timebase/b/loose.md': '3',
    },
    { mtimes: { 'D:/testing/timebase/idle': NOW - 30 * DAY_MS } },
  )

// ---- pure rules

describe('table', () => {
  test('keeps everything around the table and the line endings', async () => {
    const text = TESTING.replace(/\n/g, '\r\n')
    expect(renderTable(parseTable(text))).toBe(text)
  })

  test('splits on unescaped pipes only', async () => {
    const t = parseTable('| a | b |\n|---|---|\n| x \\| y | z |\n')
    expect(t.rows[0]).toEqual(['x \\| y', 'z'])
  })
})

describe('names and values', () => {
  test('run and folder names', async () => {
    expect(nameProblem('auth-live-v3')).toBeUndefined()
    expect(nameProblem('cert-1820-upgrade')).toBeUndefined()
    expect(nameProblem('alrode maltings')).toBe('has a space')
    expect(nameProblem('stale-pulse-ca-20260929')).toBe('has a date in it')
    expect(nameProblem('Review')).toBe('is not lowercase words joined by hyphens')
  })

  test('docker slugs', async () => {
    expect(slugProblem('full-stack')).toBeUndefined()
    expect(slugProblem('protocol-sources')).toBeUndefined()
    expect(slugProblem('stack')).toBe('is not two or three words')
    expect(slugProblem('auth-test')).toBe('has `test` in it')
    expect(slugProblem('stack-v2')).toBe('has a number or version in it')
  })

  test('status words, ports, tokens and picks', async () => {
    expect(statusWord('done: containers removed 2026-10-12')).toBe('done')
    expect(statusWord(' Running ')).toBe('running')
    expect(formatPorts([4513, 4511, 4512, 4520, 4511])).toBe('4511-4513, 4520')
    expect(parsePorts('4511-4513, 4520')).toEqual([4511, 4512, 4513, 4520])
    expect(tokens('run new timebase x "what it is" more')).toEqual(['run', 'new', 'timebase', 'x', 'what it is', 'more'])
    expect(picks(['1,3', '5-7'])).toEqual([1, 3, 5, 6, 7])
    expect(() => picks(['x'])).toThrow()
  })
})

describe('compose', () => {
  const config = JSON.stringify({
    name: 'timebase-full-stack',
    services: {
      pulse: {
        ports: [{ published: '4511', target: 80 }, { published: '4512-4513', target: 443 }],
        volumes: [{ type: 'bind', source: 'D:\\docker\\volumes\\products\\timebase\\full-stack\\pulse' }],
      },
      bad: {
        container_name: 'pinned',
        volumes: [{ type: 'volume', source: 'data' }, { type: 'bind', source: 'C:\\elsewhere' }],
      },
    },
    volumes: { data: {} },
  })

  test('reads ports and mounts from docker compose config', async () => {
    const facts = readComposeConfig(config)
    expect(facts.services[0]!.ports).toEqual([4511, 4512, 4513])
    expect(facts.services[0]!.binds).toEqual(['D:/docker/volumes/products/timebase/full-stack/pulse'])
  })

  test('reports every rule a file breaks', async () => {
    const problems = composeProblems(readComposeConfig(config), 'products/timebase/full-stack', 'D:/docker')
    expect(problems).toEqual([
      'bad sets container_name',
      'bad mounts named volume data, use a bind mount',
      'bad binds C:/elsewhere, outside D:/docker/volumes/products/timebase/full-stack',
      'declares named volumes: data',
    ])
    const renamed = composeProblems({ ...readComposeConfig(config), name: 'x' }, 'products/timebase/full-stack', 'D:/docker')
    expect(renamed[0]).toBe('name is "x", should be "timebase-full-stack"')
  })

  test('port clashes', async () => {
    expect(portClashes([{ name: 'a', ports: [1, 2, 3] }, { name: 'b', ports: [3, 4] }, { name: 'c', ports: [9] }])).toEqual([
      { a: 'a', b: 'b', ports: [3] },
    ])
  })

  test('docker ls and ps', async () => {
    const ls = parseComposeLs('[{"Name":"timebase-full-stack","Status":"running(7)","ConfigFiles":"D:\\\\docker\\\\compose\\\\x\\\\compose.yml"}]')
    expect(ls).toEqual([{ name: 'timebase-full-stack', isRunning: true, configFiles: ['D:/docker/compose/x/compose.yml'] }])
    const ps = parseDockerPs(
      [
        '{"Labels":"a=b,com.docker.compose.project=p1","CreatedAt":"2026-10-01 10:00:00 +0200 SAST"}',
        '{"Labels":"com.docker.compose.project=p1","CreatedAt":"2026-09-30 10:00:00 +0000 UTC"}',
      ].join('\n'),
    )
    expect(ps.get('p1')).toBe(Date.parse('2026-09-30T10:00:00Z'))
  })
})

describe('plan', () => {
  test('what the manifests ask for, and what has gone stale', async () => {
    const items = plan({
      now: NOW,
      staleDays: 7,
      testing: {
        table: parseTable(TESTING),
        folders: new Map([
          ['timebase/old', NOW],
          ['timebase/live', NOW],
          ['timebase/idle', NOW - 30 * DAY_MS],
          ['timebase/stray', NOW],
        ]),
      },
      docker: {
        table: parseTable(DOCKER),
        composeKeys: new Set(['products/timebase/full-stack']),
        volumeKeys: new Set(['products/timebase/full-stack', 'products/timebase/orphan-data']),
        projects: [{ name: 'timebase-full-stack', isRunning: true, configFiles: ['D:/docker/compose/products/timebase/full-stack/compose.yml'], startedMs: NOW - 9 * DAY_MS }],
        root: 'D:/docker',
      },
      docs: { table: parseTable(DOCS), files: new Set(['flow/timebase/a/one.md', 'flow/timebase/a/two.md']) },
    })
    expect(items.map(i => `${i.area} ${i.kind} ${i.id}`)).toEqual([
      'testing remove-run timebase/old',
      'testing remove-run timebase/idle',
      'testing drop-row timebase/ghost',
      'docker drop-row timebase-gone-stack',
      'docker remove-volumes products/timebase/orphan-data',
      'docker stop-stack timebase-full-stack',
      'docs remove-doc flow/timebase/a/two.md',
      'docs drop-row flow/timebase/a/gone.md',
    ])
  })
})

// ---- actions against the fake disk

describe('testing actions', () => {
  test('new, status and remove keep the folder and the row together', async () => {
    const d = drive()
    await runNew(d.io, C, 'timebase', 'fresh-run', 'a new run')
    expect(await d.io.exists('D:/testing/timebase/fresh-run')).toBe(true)
    expect(d.text('D:/testing/manifest.md')).toContain('| fresh-run | timebase\\fresh-run | a new run | running |')

    await runStatus(d.io, C, 'timebase/fresh-run', 'done', 'logs kept')
    expect(d.text('D:/testing/manifest.md')).toContain('| done: logs kept |')

    await runRemove(d.io, C, 'timebase/fresh-run')
    expect(await d.io.exists('D:/testing/timebase/fresh-run')).toBe(false)
    expect(d.text('D:/testing/manifest.md')).not.toContain('fresh-run')
  })

  test('refuses bad names, duplicates and paths outside a run', async () => {
    const d = drive()
    await expect(runNew(d.io, C, 'timebase', 'run 2026-10-13', 'x')).rejects.toThrow()
    await expect(runNew(d.io, C, 'timebase', 'live', 'x')).rejects.toThrow()
    await expect(runRemove(d.io, C, 'timebase')).rejects.toThrow()
    await expect(runRemove(d.io, C, '../docs/x')).rejects.toThrow()
    expect(d.calls.some(c => c.includes('Remove-Item'))).toBe(false)
  })
})

describe('docker and docs actions', () => {
  test('a new stack gets folders, a skeleton and a row', async () => {
    const d = drive()
    await stackNew(d.io, C, 'support', 'postgres', 'plain-db', 'a postgres to test against')
    expect(d.text('D:/docker/compose/support/postgres/plain-db/compose.yml')).toContain('name: postgres-plain-db')
    expect(await d.io.exists('D:/docker/volumes/support/postgres/plain-db')).toBe(true)
    expect(d.text('D:/docker/manifest.md')).toContain('| postgres-plain-db | a postgres to test against |  | compose/support/postgres/plain-db/compose.yml |')
    await expect(stackNew(d.io, C, 'other', 'postgres', 'plain-db', 'x')).rejects.toThrow()
  })

  test('docs rows are added for real files and dated on a status change', async () => {
    const d = drive()
    await expect(docAdd(d.io, C, 'flow/timebase/b/missing.md', 'x')).rejects.toThrow()
    await docAdd(d.io, C, 'flow/timebase/b/loose.md', 'a loose note')
    expect(d.text('D:/docs/manifest.md')).toContain('| [flow/timebase/b/loose.md](flow/timebase/b/loose.md) | a loose note | current | 2026-10-13 |')
    await docStatus(d.io, C, 'flow/timebase/a/one.md', 'abandoned')
    expect(d.text('D:/docs/manifest.md')).toContain('| one | abandoned | 2026-10-13 |')
  })
})

describe('clean', () => {
  test('plan, then apply only the picked items', async () => {
    const d = drive()
    const shown = await cleanPlan(d.io, C)
    expect(shown).toContain('1. testing remove-run timebase/old: status done')
    const items = shown.split('\n').filter(l => /^\d+\./.test(l))
    const pick = (id: string) => 1 + items.findIndex(l => l.includes(id))

    const done = await cleanApply(d.io, C, [pick('timebase/old'), pick('two.md'), pick('orphan-data')])
    expect(done).not.toContain('failed')
    expect(await d.io.exists('D:/testing/timebase/old')).toBe(false)
    expect(d.text('D:/testing/manifest.md')).not.toContain('timebase\\old')
    expect(await d.io.exists('D:/docs/flow/timebase/a/two.md')).toBe(false)
    expect(d.text('D:/docs/manifest.md')).not.toContain('two.md')
    expect(await d.io.exists('D:/docker/volumes/products/timebase/orphan-data')).toBe(false)

    // untouched: not picked, or never in the plan
    expect(await d.io.exists('D:/testing/timebase/idle')).toBe(true)
    expect(await d.io.exists('D:/testing/timebase/stray')).toBe(true)
    expect(await d.io.exists('D:/docs/flow/timebase/b/loose.md')).toBe(true)
    expect(d.text('D:/testing/manifest.md')).toContain('timebase\\ghost')
  })

  test('apply needs a recent plan and skips what changed since', async () => {
    const d = drive()
    await expect(cleanApply(d.io, C, [])).rejects.toThrow()
    await cleanPlan(d.io, C)
    await runStatus(d.io, C, 'timebase/old', 'running')
    const done = await cleanApply(d.io, C, [1])
    expect(done).toContain('skipped')
    expect(await d.io.exists('D:/testing/timebase/old')).toBe(true)
  })

  test('check reports untracked folders and files without changing anything', async () => {
    const d = drive()
    const before = d.text('D:/testing/manifest.md')
    const report = await check(d.io, C)
    expect(report).toContain('testing timebase/stray: folder with no row')
    expect(report).toContain('docs flow/timebase/b: 1 file with no row')
    expect(d.text('D:/testing/manifest.md')).toBe(before)
    expect(d.calls.some(c => c.includes('Remove-Item'))).toBe(false)
  })
})
