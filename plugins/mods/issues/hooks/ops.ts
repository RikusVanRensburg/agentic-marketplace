// The mechanical issue work, done the same way every time: what the skills used to spell
// out as gh steps. Each operation checks its inputs against the repo first, then acts,
// then reads the issue back and reports field by field. A step that acted but did not
// land throws, so the model stops instead of carrying on.

import {
  dependenciesOf,
  gh,
  type Io,
  issueTypesOf,
  labelsOf,
  milestonesOf,
  type Repo,
  subIssuesOf,
  viewOf,
} from './gh'

export type Config = { reserved: string[]; labelColor: string }

export const configOf = (options: Readonly<Record<string, unknown>>): Config => ({
  reserved: String(options.reservedFamilies ?? 'type:, scope:, state:')
    .split(',')
    .map(f => f.trim())
    .filter(Boolean),
  labelColor: String(options.labelColor ?? '1D76DB').replace(/^#/, ''),
})

// `type: feat` is in the `type:` family; a label with no colon has none.
export const familyOf = (label: string) => {
  const i = label.indexOf(':')
  return i > 0 ? label.slice(0, i + 1) : undefined
}

const issueNumber = (url: string) => {
  const m = /\/issues\/(\d+)\s*$/.exec(url.trim())
  if (!m) throw new Error(`gh issue create printed no issue URL: ${url.trim() || '(nothing)'}`)
  return Number(m[1])
}

const missingFrom = (wanted: readonly string[], have: readonly string[]) => wanted.filter(w => !have.includes(w))

// The org's spelling of a native type, or undefined when the org has none.
const nativeType = async (io: Io, r: Repo, type: string) => {
  const types = await issueTypesOf(io, r)
  if (!types.length) return { type: undefined, note: `type: ${r.owner} has no native issue types, left off` }
  const hit = types.find(t => t.toLowerCase() === type.toLowerCase())
  if (!hit) throw new Error(`type "${type}" is not one of ${r.owner}'s issue types: ${types.join(', ')}`)
  return { type: hit, note: undefined }
}

const checkLabels = async (io: Io, r: Repo, labels: readonly string[]) => {
  if (!labels.length) return
  const missing = missingFrom(labels, await labelsOf(io, r))
  if (missing.length)
    throw new Error(
      `not labels in ${r.slug}: ${missing.join(', ')}. The repo's taxonomy is never created here; ` +
        'label_ensure creates a label a plugin owns.',
    )
}

// What a skill picks from: the repo's labels by family, the org's native types, milestones.
export const taxonomy = async (io: Io, r: Repo): Promise<string> => {
  const [labels, types, milestones] = await Promise.all([labelsOf(io, r), issueTypesOf(io, r), milestonesOf(io, r)])
  const families = new Map<string, string[]>()
  for (const l of labels) {
    const f = familyOf(l) ?? '(no family)'
    families.set(f, [...(families.get(f) ?? []), l])
  }
  return [
    `${r.slug}`,
    'Labels:',
    ...(labels.length ? [...families].map(([f, ls]) => `- ${f} ${ls.join(', ')}`) : ['- none']),
    `Native issue types: ${types.join(', ') || `none (${r.owner} has none, leave type off)`}`,
    `Milestones: ${milestones.join(', ') || 'none'}`,
  ].join('\n')
}

export type CreateInput = {
  title: string
  body: string
  labels: string[]
  type?: string
  assignee?: string
  parent?: number
  blockedBy: number[]
  blocking: number[]
  milestone?: string
}

export const create = async (io: Io, r: Repo, i: CreateInput): Promise<string> => {
  if (!i.title.trim()) throw new Error('title is empty')
  if (!i.body.trim()) throw new Error('body is empty')
  await checkLabels(io, r, i.labels)
  const native = i.type ? await nativeType(io, r, i.type) : { type: undefined, note: undefined }
  if (i.milestone) {
    const milestones = await milestonesOf(io, r)
    if (!milestones.includes(i.milestone))
      throw new Error(`no milestone "${i.milestone}" in ${r.slug} (${milestones.join(', ') || 'it has none'}); milestones are attached, never created`)
  }

  const argv = [
    'issue', 'create', '-R', r.slug, '--title', i.title, '--body-file', '-',
    ...i.labels.flatMap(l => ['--label', l]),
    ...(i.assignee ? ['--assignee', i.assignee] : []),
    ...(native.type ? ['--type', native.type] : []),
    ...(i.parent ? ['--parent', String(i.parent)] : []),
    ...(i.blockedBy.length ? ['--blocked-by', i.blockedBy.join(',')] : []),
    ...(i.blocking.length ? ['--blocking', i.blocking.join(',')] : []),
    ...(i.milestone ? ['--milestone', i.milestone] : []),
  ]
  const n = issueNumber(await gh(io, argv, i.body))

  const v = await viewOf(io, r, n)
  const report = [`Created #${n} ${v.url}`]
  const problems: string[] = []
  const lacking = missingFrom(i.labels, v.labels)
  if (i.labels.length) (lacking.length ? problems : report).push(lacking.length ? `labels missing: ${lacking.join(', ')}` : `labels: ${i.labels.join(', ')}`)
  if (native.note) report.push(native.note)
  if (native.type) (v.type === native.type ? report : problems).push(v.type === native.type ? `type: ${v.type}` : `type not set (wanted ${native.type})`)
  if (i.assignee) (v.assignees.length ? report : problems).push(v.assignees.length ? `assignee: ${v.assignees.join(', ')}` : 'assignee not set')
  if (i.milestone) (v.milestone === i.milestone ? report : problems).push(v.milestone === i.milestone ? `milestone: ${v.milestone}` : 'milestone not set')
  if (i.parent) {
    const linked = (await subIssuesOf(io, r, i.parent)).includes(n)
    ;(linked ? report : problems).push(linked ? `parent: #${i.parent}, link verified` : `LINK MISSING: #${n} is not a sub-issue of #${i.parent}`)
  }
  if (i.blockedBy.length || i.blocking.length) {
    const d = await dependenciesOf(io, r, n)
    const ok = d.blockedBy >= i.blockedBy.length && d.blocking >= i.blocking.length
    ;(ok ? report : problems).push(
      `blocked by ${d.blockedBy}, blocking ${d.blocking}` + (ok ? ', verified' : ` (wanted ${i.blockedBy.length} and ${i.blocking.length})`),
    )
  }
  if (problems.length) throw new Error([...report, 'Did not land:', ...problems.map(p => `- ${p}`)].join('\n'))
  return report.join('\n')
}

export type FillInput = { body?: string; labels: string[]; type?: string; assignee?: string }

// Fills what is blank on an existing issue and leaves what is there.
export const fill = async (io: Io, r: Repo, n: number, i: FillInput): Promise<string> => {
  if (i.body !== undefined && !i.body.trim()) throw new Error('body is empty')
  const before = await viewOf(io, r, n)
  const report = [`#${n} ${before.url}`]
  const edit = (args: readonly string[], stdin?: string) => gh(io, ['issue', 'edit', String(n), '-R', r.slug, ...args], stdin)

  // Everything is checked before the first edit, so a bad input changes nothing.
  const toAdd: string[] = []
  const held: string[] = []
  for (const label of i.labels) {
    const family = familyOf(label)
    const has = before.labels.find(l => (family ? familyOf(l) === family : l === label))
    if (has) held.push(`label: ${has} already there, ${label} left off`)
    else toAdd.push(label)
  }
  await checkLabels(io, r, toAdd)
  const native = i.type && !before.type ? await nativeType(io, r, i.type) : undefined

  if (i.body !== undefined) {
    await edit(['--body-file', '-'], i.body)
    report.push('body: rewritten')
  }
  if (i.assignee) {
    if (before.assignees.length) report.push(`assignee: already ${before.assignees.join(', ')}`)
    else {
      await edit(['--add-assignee', i.assignee])
      report.push(`assignee: filled with ${i.assignee}`)
    }
  }
  report.push(...held)
  if (toAdd.length) {
    await edit(toAdd.flatMap(l => ['--add-label', l]))
    report.push(`labels: filled with ${toAdd.join(', ')}`)
  }
  if (i.type && before.type) report.push(`type: already ${before.type}`)
  if (native?.note) report.push(native.note)
  if (native?.type) {
    await edit(['--type', native.type])
    report.push(`type: filled with ${native.type}`)
  }

  const after = await viewOf(io, r, n)
  const problems = [
    ...missingFrom(toAdd, after.labels).map(l => `label ${l} not set`),
    ...(i.assignee && !after.assignees.length ? ['assignee not set'] : []),
    ...(report.some(l => l.startsWith('type: filled')) && !after.type ? ['type not set'] : []),
  ]
  if (problems.length) throw new Error([...report, 'Did not land:', ...problems.map(p => `- ${p}`)].join('\n'))
  return report.join('\n')
}

// Puts each child under the parent, then checks the set: every child must be listed.
export const link = async (io: Io, r: Repo, parent: number, children: readonly number[]): Promise<string> => {
  if (!children.length) throw new Error('no children given')
  const before = await subIssuesOf(io, r, parent)
  const added: number[] = []
  for (const child of children) {
    if (before.includes(child)) continue
    await gh(io, ['issue', 'edit', String(parent), '-R', r.slug, '--add-sub-issue', String(child)]).catch(err => {
      throw new Error(`${(err as Error).message}${added.length ? ` (linked before the failure: ${added.map(c => `#${c}`).join(', ')})` : ''}`)
    })
    added.push(child)
  }
  const after = await subIssuesOf(io, r, parent)
  const missing = children.filter(c => !after.includes(c))
  if (missing.length) throw new Error(`LINK MISSING under #${parent}: ${missing.map(c => `#${c}`).join(', ')}`)
  const already = children.length - added.length
  return `${children.length} verified as sub-issues of #${parent}` + (already ? ` (${added.length} linked now, ${already} already there)` : '')
}

// Creates labels a plugin owns. The repo's shared families are team vocabulary and refused.
export const ensureLabels = async (io: Io, r: Repo, c: Config, labels: readonly string[], description: string, color?: string) => {
  if (!labels.length) throw new Error('no labels given')
  const reserved = labels.filter(l => c.reserved.some(f => familyOf(l) === f))
  if (reserved.length) throw new Error(`${reserved.join(', ')}: the ${c.reserved.join(' ')} families are the repo's own taxonomy and are never created here`)
  const hex = (color ?? c.labelColor).replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`color must be six hex digits, not "${hex}"`)
  const existing = await labelsOf(io, r)
  const created: string[] = []
  for (const label of labels) {
    if (existing.includes(label)) continue
    await gh(io, ['label', 'create', label, '-R', r.slug, '--color', hex, '--description', description])
    created.push(label)
  }
  const kept = labels.filter(l => !created.includes(l))
  return [created.length ? `created: ${created.join(', ')}` : '', kept.length ? `already there: ${kept.join(', ')}` : ''].filter(Boolean).join('\n')
}

// ---- consolidating a duplicate: the model plans it, the person carries it out

export const PLAN_KEY = 'consolidate'
export const PLAN_MS = 60 * 60 * 1000

export type Plan = { repo: string; survivor: number; loser: number; carryOver: string; at: number }

export const planConsolidate = async (io: Io, r: Repo, survivor: number, loser: number, carryOver: string) => {
  if (survivor === loser) throw new Error('survivor and loser are the same issue')
  const [s, l] = await Promise.all([viewOf(io, r, survivor), viewOf(io, r, loser)])
  const plan: Plan = { repo: r.slug, survivor, loser, carryOver: carryOver.trim(), at: await io.now() }
  await io.storeSet(PLAN_KEY, plan)
  return [
    `Planned in ${r.slug}: keep #${s.number} ${s.title}, close #${l.number} ${l.title} as a duplicate.`,
    plan.carryOver ? '1. comment the carried-over content on the survivor' : '1. nothing to carry over',
    '2. cross-link both issues by number and title',
    '3. add the duplicate label to the loser, if the repo has one',
    '4. close the loser as not planned',
    'Nothing has changed yet. The person runs /issues consolidate to carry it out, within the hour.',
  ].join('\n')
}

export const pendingPlan = async (io: Io): Promise<Plan | undefined> => {
  const plan = (await io.storeGet(PLAN_KEY)) as Plan | undefined
  if (!plan) return undefined
  if ((await io.now()) - plan.at > PLAN_MS) {
    await io.storeDelete(PLAN_KEY)
    return undefined
  }
  return plan
}

export const applyConsolidate = async (io: Io, r: Repo, plan: Plan): Promise<string> => {
  await io.storeDelete(PLAN_KEY)
  const [s, l] = await Promise.all([viewOf(io, r, plan.survivor), viewOf(io, r, plan.loser)])
  const done: string[] = []
  const step = async (name: string, work: () => Promise<unknown>) => {
    try {
      await work()
      done.push(name)
    } catch (err) {
      throw new Error(`Partial: ${done.length ? `done ${done.join(', ')}; ` : ''}stopped at ${name}: ${(err as Error).message}`)
    }
  }
  const comment = (n: number, body: string) => gh(io, ['issue', 'comment', String(n), '-R', r.slug, '--body-file', '-'], body)

  if (plan.carryOver) await step('carry over', () => comment(s.number, `Carried over from #${l.number} (${l.title}):\n\n${plan.carryOver}`))
  await step('cross-link', async () => {
    await comment(s.number, `#${l.number} (${l.title}) is a duplicate of this issue and was consolidated into it.`)
    await comment(l.number, `Duplicate of #${s.number} (${s.title}).`)
  })
  if ((await labelsOf(io, r)).includes('duplicate'))
    await step('duplicate label', () => gh(io, ['issue', 'edit', String(l.number), '-R', r.slug, '--add-label', 'duplicate']))
  await step('close', () =>
    gh(io, ['issue', 'close', String(l.number), '-R', r.slug, '--reason', 'not planned', '--comment', `Duplicate of #${s.number} (${s.title}), consolidated.`]),
  )
  return `Consolidated: kept #${s.number}, closed #${l.number}. Done: ${done.join(', ')}.`
}
