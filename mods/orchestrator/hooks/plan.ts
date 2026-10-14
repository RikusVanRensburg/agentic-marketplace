// The plan the pre-flight skill hands to `orchestrator_launch`, and the checks that run on it
// before any agent starts. A plan that fails any check launches nothing, and the refusal names
// every problem at once.

import type { Config, Mode } from './config'
import { MODES } from './config'

export type Commands = { build: string; test: string }

// What a haiku-first slice must be given. Every field is required for haiku-first, optional
// otherwise; when present it goes into every dev prompt for the slice.
export type Brief = {
  goal: string
  inScope: { files: string[]; symbols: string[] }
  outOfScope: string[]
  acceptance: string[]
  commands: Commands
  done: string
  returns: string
}

export type RepoPlan = {
  // The folder holding `.bare`.
  root: string
  // The branch the integration branch is cut from; may be a stacked branch.
  base: string
  commands: Commands
}

export type SlicePlan = {
  // Issue number for a GitHub plan, a short id (`t3`) for a plain one.
  id: string
  title: string
  slug: string
  repo: string
  deps: string[]
  mode: Mode
  // The full text of the slice, for a plain plan. A GitHub slice is read fresh from its issue.
  body?: string
  brief?: Brief
  // Set only when the repo's own branch rule differs from the orchestrator's shape.
  branch?: string
}

export type Source = { kind: 'github'; parent: string } | { kind: 'plain'; text: string }

export type Plan = {
  title: string
  slug: string
  type: string
  initials: string
  source: Source
  repos: Record<string, RepoPlan>
  slices: SlicePlan[]
  integrationBranch?: string
  // Set when the pre-flight accepts that unordered slices touch the same files.
  allowOverlap?: boolean
}

export const TYPES: readonly string[] = ['feat', 'fix', 'docs', 'chore', 'refactor', 'test']

const SLUG = /^[a-z0-9][a-z0-9-]*$/
const ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/

export const integrationBranchOf = (plan: Plan) => plan.integrationBranch ?? `${plan.type}/${plan.initials}/${plan.slug}`

export const sliceBranchOf = (plan: Plan, slice: SlicePlan) =>
  slice.branch ?? `${plan.type}/${plan.initials}/orchestration/${plan.slug}/${slice.id}-${slice.slug}`

export const worktreePathOf = (root: string, branch: string) => `${root.replace(/[\\/]+$/, '')}/${branch}`

// Git keeps a branch as a file under refs/heads, so `a/b` and `a/b/c` cannot both exist.
export function clashOf(branches: string[]): [string, string] | null {
  const sorted = [...branches].sort()

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i] as string
      const b = sorted[j] as string

      if (a === b || b.startsWith(`${a}/`)) {
        return [a, b]
      }
    }
  }

  return null
}

export const isOrchestrationBranch = (branch: string) => /^[^/]+\/[^/]+\/orchestration(\/|$)/i.test(branch)

const filled = (value: unknown) => typeof value === 'string' && value.trim() !== ''
const list = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(filled)

// Mechanical checks only: that the pre-flight agent filled every field haiku needs. Whether
// the content is right is pre-flight's job.
export function briefProblems(brief: Brief | undefined): string[] {
  if (!brief) {
    return ['no brief']
  }

  const problems: string[] = []
  const goal = typeof brief.goal === 'string' ? brief.goal.trim() : ''

  if (!goal) problems.push('goal is missing')
  else if (/[.!?]\s+\S/.test(goal) || goal.includes('\n')) problems.push('goal is more than one sentence')
  if (!brief.inScope || !list(brief.inScope.files)) problems.push('no files in scope')
  if (!brief.inScope || !list(brief.inScope.symbols)) problems.push('no symbols in scope')
  if (!Array.isArray(brief.outOfScope) || !brief.outOfScope.every(filled)) problems.push('out of scope is not a list')
  if (!list(brief.acceptance)) problems.push('no acceptance criteria')
  if (!brief.commands || !filled(brief.commands.build)) problems.push('no build command')
  if (!brief.commands || !filled(brief.commands.test)) problems.push('no test command')
  if (!filled(brief.done)) problems.push('no definition of done')
  if (!filled(brief.returns)) problems.push('does not say what to return')

  return problems
}

// Returns the cycle as a path, or null.
export function cycleOf(slices: SlicePlan[]): string[] | null {
  const deps = new Map(slices.map(s => [s.id, s.deps]))
  const state = new Map<string, 1 | 2>()

  const visit = (id: string, path: string[]): string[] | null => {
    if (state.get(id) === 2) return null
    if (state.get(id) === 1) return [...path.slice(path.indexOf(id)), id]

    state.set(id, 1)

    for (const dep of deps.get(id) ?? []) {
      if (deps.has(dep)) {
        const found = visit(dep, [...path, id])
        if (found) return found
      }
    }

    state.set(id, 2)
    return null
  }

  for (const slice of slices) {
    const found = visit(slice.id, [])
    if (found) return found
  }

  return null
}

export type PlanResult = { isValid: true; plan: Plan } | { isValid: false; errors: string[] }

export function validatePlan(input: unknown, config: Config): PlanResult {
  const errors: string[] = []
  const plan = input as Plan

  if (!plan || typeof plan !== 'object') {
    return { isValid: false, errors: ['the plan is not an object'] }
  }

  if (!filled(plan.title)) errors.push('title is missing')
  if (typeof plan.slug !== 'string' || !SLUG.test(plan.slug)) errors.push(`slug "${plan.slug}" is not lower-case kebab`)
  if (!TYPES.includes(plan.type)) errors.push(`type "${plan.type}" is not one of ${TYPES.join(', ')}`)
  if (typeof plan.initials !== 'string' || !/^[A-Za-z]{2,4}$/.test(plan.initials)) errors.push(`initials "${plan.initials}" are not 2 to 4 letters`)

  if (!plan.source || (plan.source.kind !== 'github' && plan.source.kind !== 'plain')) {
    errors.push('source must be { kind: "github", parent } or { kind: "plain", text }')
  } else if (plan.source.kind === 'github' && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(plan.source.parent)) {
    errors.push(`source.parent "${plan.source.parent}" is not a GitHub issue URL`)
  } else if (plan.source.kind === 'plain' && !filled(plan.source.text)) {
    errors.push('source.text is empty')
  }

  const repos = plan.repos && typeof plan.repos === 'object' ? plan.repos : {}

  if (!Object.keys(repos).length) errors.push('no repos')

  for (const [name, repo] of Object.entries(repos)) {
    if (!repo || !filled(repo.root)) errors.push(`repo ${name}: root is missing`)
    if (!repo || !filled(repo.base)) errors.push(`repo ${name}: base is missing`)
    if (!repo || !repo.commands || !filled(repo.commands.build) || !filled(repo.commands.test)) {
      errors.push(`repo ${name}: needs build and test commands, the integration verify runs them`)
    }
  }

  const slices = Array.isArray(plan.slices) ? plan.slices : []

  if (!slices.length) errors.push('no slices')

  const ids = new Set<string>()

  for (const slice of slices) {
    const at = `slice ${slice?.id ?? '?'}`

    if (!slice || typeof slice.id !== 'string' || !ID.test(slice.id)) {
      errors.push(`${at}: id must be letters, digits and dashes`)
      continue
    }

    if (ids.has(slice.id)) errors.push(`${at}: id is used twice`)
    ids.add(slice.id)

    if (!filled(slice.title)) errors.push(`${at}: title is missing`)
    if (typeof slice.slug !== 'string' || !SLUG.test(slice.slug)) errors.push(`${at}: slug "${slice.slug}" is not lower-case kebab`)
    if (!repos[slice.repo]) errors.push(`${at}: repo "${slice.repo}" is not in repos`)
    if (!MODES.includes(slice.mode)) errors.push(`${at}: mode "${slice.mode}" is not ${MODES.join(' or ')}`)
    if (!Array.isArray(slice.deps)) errors.push(`${at}: deps must be a list`)
    if (plan.source?.kind === 'plain' && !filled(slice.body)) errors.push(`${at}: a plain plan needs the slice body`)
    if (plan.source?.kind === 'github' && !/^\d+$/.test(slice.id)) errors.push(`${at}: a GitHub slice id is its issue number`)

    if (slice.mode === 'haiku-first') {
      const problems = briefProblems(slice.brief)
      if (problems.length) errors.push(`${at}: haiku-first brief: ${problems.join('; ')}`)
    }

    if (MODES.includes(slice.mode) && !config.ladders[slice.mode].length) errors.push(`${at}: the ${slice.mode} ladder is empty`)
  }

  for (const slice of slices) {
    for (const dep of Array.isArray(slice?.deps) ? slice.deps : []) {
      if (dep === slice.id) errors.push(`slice ${slice.id}: depends on itself`)
      else if (!ids.has(dep)) errors.push(`slice ${slice.id}: depends on ${dep}, which is not in the plan`)
    }
  }

  if (!errors.length) {
    const cycle = cycleOf(slices)
    if (cycle) errors.push(`dependency cycle: ${cycle.join(' -> ')}`)
  }

  if (!errors.length) {
    const integration = integrationBranchOf(plan)

    if (isOrchestrationBranch(integration)) {
      errors.push(`integration branch ${integration} must not sit under orchestration/`)
    }

    for (const name of Object.keys(repos)) {
      const branches = [integration, ...slices.filter(s => s.repo === name).map(s => sliceBranchOf(plan, s))]
      const clash = clashOf(branches)

      if (clash) {
        errors.push(
          clash[0] === clash[1]
            ? `repo ${name}: branch ${clash[0]} is used twice`
            : `repo ${name}: branches ${clash[0]} and ${clash[1]} cannot both exist in git`,
        )
      }
    }
  }

  return errors.length ? { isValid: false, errors } : { isValid: true, plan }
}

// Applies what the tracker says at launch: closed as completed means the slice already landed;
// closed for any other reason means it left the plan unbuilt, which is only acceptable when
// nothing still to build depends on it.
export type Closed = { completed: string[]; other: string[] }

export function reconcileProblems(plan: Plan, closed: Closed): string[] {
  const done = new Set(closed.completed)
  const dropped = new Set(closed.other.filter(id => !done.has(id)))

  return plan.slices
    .filter(s => !done.has(s.id) && !dropped.has(s.id))
    .flatMap(s => s.deps.filter(d => dropped.has(d)).map(d => `slice ${s.id} depends on ${d}, which is closed without being completed`))
}

// Slices that name the same files in their briefs and that no dependency orders run side by
// side from the same base, so the second to merge conflicts. Either add an edge or say so.
export function overlapProblems(plan: Plan): string[] {
  const deps = new Map(plan.slices.map(s => [s.id, s.deps]))
  const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (from === to) return true
    if (seen.has(from)) return false
    seen.add(from)
    return (deps.get(from) ?? []).some(d => reaches(d, to, seen))
  }
  const problems: string[] = []
  const withFiles = plan.slices.filter(s => s.brief?.inScope.files.length)
  for (let i = 0; i < withFiles.length; i++) {
    for (let j = i + 1; j < withFiles.length; j++) {
      const a = withFiles[i] as SlicePlan
      const b = withFiles[j] as SlicePlan
      if (a.repo !== b.repo || reaches(a.id, b.id) || reaches(b.id, a.id)) continue
      const shared = a.brief!.inScope.files.filter(f => b.brief!.inScope.files.includes(f))
      if (shared.length) problems.push(`slices ${a.id} and ${b.id} both change ${shared.join(', ')} with no dependency between them`)
    }
  }
  return problems
}
