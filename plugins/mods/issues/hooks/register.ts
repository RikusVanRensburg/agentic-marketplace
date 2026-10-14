// The issues mod: the mechanical half of GitHub issue work in code. The skills keep the
// judgment (what to write, whether two issues are duplicates); these tools do the gh
// steps and check that each one landed. Closing a duplicate is planned by the model and
// carried out only when the person types /issues consolidate.

import type { EngineInterface, Register } from 'claude-code'

import { route } from './command'

import { type Io, repoOf } from './gh'
import { type Config, configOf, create, ensureLabels, fill, link, planConsolidate, taxonomy } from './ops'

type Input = Record<string, unknown>
const str = (i: Input, key: string) => (typeof i[key] === 'string' ? (i[key] as string) : '')
const opt = (i: Input, key: string) => str(i, key).trim() || undefined
const strs = (i: Input, key: string) => (Array.isArray(i[key]) ? (i[key] as unknown[]).map(String).map(s => s.trim()).filter(Boolean) : [])
const num = (i: Input, key: string) => {
  const n = Number(i[key])
  return Number.isInteger(n) && n > 0 ? n : undefined
}
const need = (i: Input, key: string) => {
  const n = num(i, key)
  if (!n) throw new Error(`${key} must be an issue number`)
  return n
}
const nums = (i: Input, key: string) => {
  const raw = Array.isArray(i[key]) ? (i[key] as unknown[]) : []
  const out = raw.map(Number)
  if (out.some(n => !Number.isInteger(n) || n <= 0)) throw new Error(`${key} must be issue numbers`)
  return out
}

const REPO = { type: 'string', description: 'owner/name; left out, the repo the session folder is a clone of' }
const NUMS = { type: 'array', items: { type: 'integer' } }

type Tool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run: (io: Io, i: Input, c: Config) => Promise<string>
}

const TOOLS: readonly Tool[] = [
  {
    name: 'issue_labels',
    description:
      "List a repo's labels grouped by family (type:, scope:, ...), its org's native issue types, and its milestones. Read it before picking labels, a type or a milestone for issue_create or issue_fill. Changes nothing.",
    inputSchema: { type: 'object', properties: { repo: REPO } },
    run: async (io, i) => taxonomy(io, await repoOf(io, opt(i, 'repo'))),
  },
  {
    name: 'issue_create',
    description:
      'Create a GitHub issue and verify it landed: labels (each must already exist), native issue type, assignee, parent (sub-issue link verified), blocked-by and blocking edges, and an existing milestone. Reports field by field; errors if anything asked for did not land. Use this instead of gh issue create.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: REPO,
        title: { type: 'string' },
        body: { type: 'string', description: 'the full markdown body' },
        labels: { type: 'array', items: { type: 'string' }, description: 'exact label names from issue_labels' },
        type: { type: 'string', description: 'native issue type, e.g. Feature, Bug, Task; dropped with a note when the org has none' },
        assignee: { type: 'string', description: '@me or a login; leave out for issues whose claim is the assignee' },
        parent: { type: 'integer', description: 'parent issue number' },
        blockedBy: NUMS,
        blocking: NUMS,
        milestone: { type: 'string', description: 'an existing milestone title' },
      },
      required: ['title', 'body'],
    },
    run: async (io, i) =>
      create(io, await repoOf(io, opt(i, 'repo')), {
        title: str(i, 'title'),
        body: str(i, 'body'),
        labels: strs(i, 'labels'),
        type: opt(i, 'type'),
        assignee: opt(i, 'assignee'),
        parent: num(i, 'parent'),
        blockedBy: nums(i, 'blockedBy'),
        blocking: nums(i, 'blocking'),
        milestone: opt(i, 'milestone'),
      }),
  },
  {
    name: 'issue_fill',
    description:
      'Fill what is blank on an existing issue and leave what is there: rewrite the body if given, add the assignee only when none is set, add each label only when the issue has none of that family, set the native type only when unset. Reports what was filled and what was already there. Use this instead of gh issue edit.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: REPO,
        number: { type: 'integer' },
        body: { type: 'string', description: 'the new full body; leave out to keep the body' },
        labels: { type: 'array', items: { type: 'string' } },
        type: { type: 'string' },
        assignee: { type: 'string' },
      },
      required: ['number'],
    },
    run: async (io, i) =>
      fill(io, await repoOf(io, opt(i, 'repo')), need(i, 'number'), {
        body: typeof i.body === 'string' ? i.body : undefined,
        labels: strs(i, 'labels'),
        type: opt(i, 'type'),
        assignee: opt(i, 'assignee'),
      }),
  },
  {
    name: 'issue_link',
    description:
      'Put existing issues under a parent as sub-issues, then verify every one is listed under it (paginated set check). Errors naming any link that is missing. Use this instead of gh issue edit --add-sub-issue or the sub_issues API.',
    inputSchema: {
      type: 'object',
      properties: { repo: REPO, parent: { type: 'integer' }, children: NUMS },
      required: ['parent', 'children'],
    },
    run: async (io, i) => link(io, await repoOf(io, opt(i, 'repo')), need(i, 'parent'), nums(i, 'children')),
  },
  {
    name: 'label_ensure',
    description:
      "Create labels a plugin or workflow owns when they are missing. Refuses the repo's shared taxonomy families (type:, scope:, state: by default), which are never created by a tool.",
    inputSchema: {
      type: 'object',
      properties: {
        repo: REPO,
        labels: { type: 'array', items: { type: 'string' } },
        description: { type: 'string', description: 'what the labels are for' },
        color: { type: 'string', description: 'six hex digits; left out, the configured color' },
      },
      required: ['labels', 'description'],
    },
    run: async (io, i, c) =>
      ensureLabels(io, await repoOf(io, opt(i, 'repo')), c, strs(i, 'labels'), str(i, 'description'), opt(i, 'color')),
  },
  {
    name: 'issue_consolidate',
    description:
      'Plan closing a duplicate once the person has named the survivor: carry the loser\'s missing content over, cross-link both, label the loser duplicate if the repo has that label, and close it as not planned. Only plans; nothing changes until the person types /issues consolidate.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: REPO,
        survivor: { type: 'integer', description: 'the issue the person chose to keep' },
        loser: { type: 'integer', description: 'the issue to close' },
        carryOver: { type: 'string', description: "what the loser holds that the survivor lacks, as markdown; empty when nothing" },
      },
      required: ['survivor', 'loser'],
    },
    run: async (io, i) =>
      planConsolidate(io, await repoOf(io, opt(i, 'repo')), need(i, 'survivor'), need(i, 'loser'), str(i, 'carryOver')),
  },
]

const answer = async (work: () => Promise<string>) => {
  try {
    return { text: await work(), isError: false }
  } catch (err) {
    return { text: (err as Error).message, isError: true }
  }
}

const ioOf = ($: EngineInterface): Io => ({
  run: (argv, init) => $.process.run(argv, init),
  now: () => $.clock.now(),
  storeGet: key => $.store.get(key),
  storeSet: (key, value) => $.store.set(key, value),
  storeDelete: key => $.store.delete(key),
})

export const register: Register = (on, options) => {
  const c = configOf(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'issues',
      description: 'Carry out or drop a planned duplicate consolidation',
      argumentHint: '[consolidate [cancel]]',
    })
    for (const tool of TOOLS) {
      await $.tool.register({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })
    }
    return next(e)
  })

  on('command.run', { command: 'issues' }, async ($, e) => {
    const { text } = await answer(() => route(ioOf($), e.args, e.origin))
    return { text }
  })

  for (const tool of TOOLS) {
    on('tool.call', { tool: `mcp__issues__${tool.name}` }, async ($, e) => {
      const { text, isError } = await answer(() => tool.run(ioOf($), e as unknown as Input, c))
      return isError ? { deny: text } : { result: text }
    })
  }
}
