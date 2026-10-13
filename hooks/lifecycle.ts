// The building blocks: create, ship, check, clean, sweep and list. Each takes the runner and
// answers an outcome; nothing here draws, asks or remembers. Ship and clean come in two
// halves, prepare (checks, then a plan) and run (the plan, once the person said yes).

import type {
  WorktreeCleanArgs,
  WorktreeCleanPlan,
  WorktreeCreateArgs,
  WorktreeCreated,
  WorktreeEntry,
  WorktreeOutcome,
  WorktreePr,
  WorktreeShipArgs,
  WorktreeShipPlan,
} from '../types'
import {
  branchAt,
  changesAt,
  defaultBranch,
  firstLine,
  hasRef,
  isAncestor,
  lifecycleKeys,
  refNames,
  repoAt,
  setKey,
  shaOf,
  worktrees,
  type Repo,
  type Run,
} from './git'
import { isInside } from './paths'
import {
  FALLBACK_RULE,
  PROSE_FILES,
  clashOf,
  compiles,
  initialsOf,
  isReserved,
  isSlug,
  isType,
  mentionsBranchNaming,
  namingPrompt,
  patternsInWorkflow,
  ruleFromAnswer,
  TYPES,
  type BranchRule,
} from './rules'

export const PLUGIN = 'worktree-lifecycle'

export type Ctx = {
  run: Run
  exists: (path: string) => Promise<boolean>
  // One question to a small model; null when it could not answer.
  complete: (prompt: string) => Promise<string | null>
  isWindows: boolean
  // Who asked: this plugin for the person and the model, another plugin's name otherwise.
  caller: string
}

type Fail = { isDone: false; reason: string }

const fail = (reason: string): Fail => ({ isDone: false, reason })

// Rules found per repo and base commit, so one session asks a model once.
const rules = new Map<string, BranchRule>()

async function bareRepo(ctx: Ctx, cwd: string): Promise<Repo | Fail> {
  const repo = await repoAt(ctx.run, cwd)

  if (repo === null) {
    return fail(`${cwd} is not inside a git repository.`)
  }

  if (!repo.isBareLayout) {
    return fail(`${repo.root} is a normal clone. This mod works on the bare layout (.bare plus one worktree per branch); convert the clone first.`)
  }

  return repo
}

async function fetchOrigin(ctx: Ctx, root: string, refspec?: string): Promise<string | null> {
  const fetched = await ctx.run(['git', '-C', root, 'fetch', 'origin', ...(refspec ? [refspec] : [])], { timeoutMs: 120_000 })

  return fetched.exitCode === 0 ? null : `fetch failed (${firstLine(fetched)}), so origin may be stale`
}

export async function ruleFor(ctx: Ctx, root: string, base: string): Promise<BranchRule> {
  const ref = (await hasRef(ctx.run, root, `refs/remotes/origin/${base}`)) ? `origin/${base}` : base
  const sha = (await shaOf(ctx.run, root, ref)) ?? ref
  const key = `${root}|${sha}`
  const known = rules.get(key)

  if (known !== undefined) {
    return known
  }

  const show = async (path: string) => {
    const shown = await ctx.run(['git', '-C', root, 'show', `${sha}:${path}`])
    return shown.exitCode === 0 ? shown.stdout : null
  }

  const listed = await ctx.run(['git', '-C', root, 'ls-tree', '--name-only', sha, '--', '.github/workflows/'])
  const workflows = listed.stdout.replace(/\r/g, '').split('\n').filter(path => /\.ya?ml$/.test(path))
  let rule: BranchRule | null = null

  for (const path of workflows) {
    const pattern = patternsInWorkflow((await show(path)) ?? '')[0]

    if (pattern !== undefined) {
      rule = { pattern, source: path }
      break
    }
  }

  if (rule === null) {
    const prose: { path: string; text: string }[] = []

    for (const path of PROSE_FILES) {
      const text = await show(path)
      if (text !== null && mentionsBranchNaming(text)) prose.push({ path, text })
    }

    const pattern = prose.length > 0 ? ruleFromAnswer(await ctx.complete(namingPrompt(prose))) : null
    rule = pattern === null ? FALLBACK_RULE : { pattern, source: `${prose.map(file => file.path).join(', ')} (read by a model)` }
  }

  rules.set(key, rule)

  return rule
}

export async function create(ctx: Ctx, args: WorktreeCreateArgs, cwd: string): Promise<WorktreeOutcome<WorktreeCreated>> {
  const repo = await bareRepo(ctx, args.cwd ?? cwd)

  if ('isDone' in repo) {
    return repo
  }

  const { root } = repo
  const stale = await fetchOrigin(ctx, root)
  const base = args.base ?? (await branchAt(ctx.run, args.cwd ?? cwd)) ?? (await defaultBranch(ctx.run, root))

  if (base === null) {
    return fail('Could not tell which branch to cut from; name a base.')
  }

  let branch = args.branch

  if (branch === undefined) {
    if (args.type === undefined || !isType(args.type)) {
      return fail(`Give a type (${TYPES.join(', ')}) and a slug, or a whole branch name.`)
    }

    if (args.slug === undefined || !isSlug(args.slug)) {
      return fail('The slug is lowercase words joined by hyphens, like tree-pane.')
    }

    const name = await ctx.run(['git', '-C', root, 'config', 'user.name'])
    const initials = initialsOf(name.stdout)

    if (initials === null) {
      return fail('Could not take initials from git config user.name; give a whole branch name instead.')
    }

    branch = `${args.type}/${initials}/${args.slug}`
  }

  if (isReserved(branch)) {
    return fail(`${branch} is under <type>/<initials>/orchestration/, which the orchestrator owns.`)
  }

  const rule = await ruleFor(ctx, root, base)

  if (!compiles(rule.pattern) || !new RegExp(rule.pattern).test(branch)) {
    return fail(`${branch} does not match the branch rule from ${rule.source}: ${rule.pattern}`)
  }

  if ((await ctx.run(['git', 'check-ref-format', '--branch', branch])).exitCode !== 0) {
    return fail(`${branch} is not a valid branch name.`)
  }

  const refs = await refNames(ctx.run, root)
  const clash = clashOf(branch, refs.local) ?? clashOf(branch, refs.remote)

  if (clash !== null) {
    return fail(
      clash === branch
        ? `A branch ${branch} already exists${refs.local.includes(branch) ? '' : ' on origin'}.`
        : `${branch} clashes with the branch ${clash}: git cannot hold a/b beside a/b/c.`,
    )
  }

  const path = `${root}/${branch}`

  if (await ctx.exists(path)) {
    return fail(`${path} already exists on disk; it is usually what a removed worktree left behind.`)
  }

  const startPoint = await startPointOf(ctx, root, base)

  if (startPoint === null) {
    return fail(`There is no branch ${base}, locally or on origin.`)
  }

  const added = await ctx.run(['git', '-C', root, 'worktree', 'add', '--no-track', '-b', branch, path, startPoint], { timeoutMs: 120_000 })

  if (added.exitCode !== 0) {
    return fail(`git worktree add failed: ${firstLine(added)}`)
  }

  await setKey(ctx.run, root, branch, 'Owner', ctx.caller)
  await setKey(ctx.run, root, branch, 'Base', base)

  return { isDone: true, branch, path, base, startPoint, rule: stale ? `${rule.source}; ${stale}` : rule.source }
}

// The local base when origin has nothing it lacks; origin's when the local one is behind.
async function startPointOf(ctx: Ctx, root: string, base: string): Promise<string | null> {
  const local = await hasRef(ctx.run, root, `refs/heads/${base}`)
  const remote = await hasRef(ctx.run, root, `refs/remotes/origin/${base}`)

  if (local && remote) {
    return (await isAncestor(ctx.run, root, `origin/${base}`, base)) ? base : `origin/${base}`
  }

  return local ? base : remote ? `origin/${base}` : null
}

async function resolveBranch(ctx: Ctx, branch: string | undefined, cwd: string): Promise<string | Fail> {
  const named = branch ?? (await branchAt(ctx.run, cwd))

  return named ?? fail('Name the branch: the working directory is not on one.')
}

export async function prepareShip(ctx: Ctx, args: WorktreeShipArgs, cwd: string): Promise<WorktreeOutcome<{ plan: WorktreeShipPlan; lines: string[] }>> {
  const repo = await bareRepo(ctx, args.cwd ?? cwd)

  if ('isDone' in repo) {
    return repo
  }

  const branch = await resolveBranch(ctx, args.branch, args.cwd ?? cwd)

  if (typeof branch !== 'string') {
    return branch
  }

  const { root } = repo
  const tree = (await worktrees(ctx.run, root)).find(row => row.branch === branch)

  if (tree === undefined) {
    return fail(`${branch} has no worktree to ship from.`)
  }

  const changes = await changesAt(ctx.run, tree.path)

  if (changes.length > 0) {
    return fail(`${tree.path} has uncommitted changes (${changes.slice(0, 3).join('; ')}). Commit them first.`)
  }

  const keys = (await lifecycleKeys(ctx.run, root)).get(branch)
  const base = args.base ?? keys?.base ?? (await closestBase(ctx, root, branch))

  if (base === null || base === branch) {
    return fail('Could not tell which branch this merges into; name a base.')
  }

  const stale = await fetchOrigin(ctx, root, base)
  const target = (await hasRef(ctx.run, root, `refs/remotes/origin/${base}`)) ? `origin/${base}` : base
  const ahead = await ctx.run(['git', '-C', root, 'rev-list', '--count', `${target}..${branch}`])

  if (ahead.exitCode !== 0 || Number(ahead.stdout.trim()) === 0) {
    return fail(`${branch} has nothing ahead of ${target} to ship.`)
  }

  const open = await ctx.run(['gh', 'pr', 'list', '--head', branch, '--state', 'open', '--json', 'url', '-q', '.[0].url'], { cwd: tree.path })
  const openPr = open.exitCode === 0 && open.stdout.trim() !== '' ? open.stdout.trim() : null
  const subject = await ctx.run(['git', '-C', tree.path, 'log', '-1', '--format=%s'])
  const log = await ctx.run(['git', '-C', root, 'log', '--reverse', '--format=- %s', `${target}..${branch}`])
  const title = args.title ?? subject.stdout.trim()
  const body = args.body ?? log.stdout.trim()
  const isDraft = args.isReady !== true
  const plan: WorktreeShipPlan = { kind: 'ship', root, branch, path: tree.path, base, title, body, isDraft, openPr }
  const count = Number(ahead.stdout.trim())
  const lines = openPr
    ? [`Push ${count} commit${count === 1 ? '' : 's'} to the open PR ${openPr}`]
    : [`${isDraft ? 'Draft' : 'Ready'} PR into ${base}: ${title}`, `${count} commit${count === 1 ? '' : 's'} ahead of ${target}`]

  return { isDone: true, plan, lines: stale ? [...lines, stale] : lines }
}

// The candidate base the branch is fewest commits ahead of; `merge-base --fork-point`
// reads the reflog, which a fresh worktree does not have.
async function closestBase(ctx: Ctx, root: string, branch: string): Promise<string | null> {
  const fallback = await defaultBranch(ctx.run, root)
  const { remote } = await refNames(ctx.run, root)
  let best: { name: string; ahead: number } | null = null

  for (const name of remote) {
    if (name === branch) continue
    const ahead = await ctx.run(['git', '-C', root, 'rev-list', '--count', `origin/${name}..${branch}`])
    const count = Number(ahead.stdout.trim())
    if (ahead.exitCode === 0 && (best === null || count < best.ahead || (count === best.ahead && name === fallback))) best = { name, ahead: count }
  }

  return best?.name ?? fallback
}

export async function runShip(ctx: Ctx, plan: WorktreeShipPlan): Promise<WorktreeOutcome<{ text: string; url: string | null }>> {
  const pushed = await ctx.run(['git', '-C', plan.path, 'push', '-u', 'origin', plan.branch], { timeoutMs: 300_000 })

  if (pushed.exitCode !== 0) {
    return fail(`Push failed: ${firstLine(pushed)}`)
  }

  if (plan.openPr !== null) {
    return { isDone: true, text: `Pushed ${plan.branch} to ${plan.openPr}.`, url: plan.openPr }
  }

  const created = await ctx.run(
    ['gh', 'pr', 'create', '--base', plan.base, '--head', plan.branch, '--title', plan.title, '--body-file', '-', ...(plan.isDraft ? ['--draft'] : [])],
    { cwd: plan.path, stdin: plan.body, timeoutMs: 120_000 },
  )

  if (created.exitCode !== 0) {
    return fail(`Pushed ${plan.branch}, but gh pr create failed: ${firstLine(created)}`)
  }

  const url = created.stdout.trim().split('\n').pop() ?? null

  return { isDone: true, text: `Pushed ${plan.branch} and opened a ${plan.isDraft ? 'draft ' : ''}PR into ${plan.base}: ${url}`, url }
}

export async function list(ctx: Ctx, cwd: string): Promise<WorktreeOutcome<{ entries: WorktreeEntry[]; root: string }>> {
  const repo = await bareRepo(ctx, cwd)

  if ('isDone' in repo) {
    return repo
  }

  const keys = await lifecycleKeys(ctx.run, repo.root)
  const rows = await worktrees(ctx.run, repo.root)
  const entries: WorktreeEntry[] = []

  for (const [branch, key] of keys) {
    if (key.owner === undefined) continue
    const row = rows.find(one => one.branch === branch)
    entries.push({ branch, path: row?.path ?? null, owner: key.owner, base: key.base ?? null, isNotified: key.isNotified === true })
  }

  return { isDone: true, entries, root: repo.root }
}

export async function prOf(ctx: Ctx, root: string, branch: string): Promise<WorktreePr | null> {
  const listed = await ctx.run(
    ['gh', 'pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'number,url,state,isDraft,baseRefName,headRefOid'],
    { cwd: root },
  )

  try {
    const [pr] = JSON.parse(listed.stdout) as { number: number; url: string; state: WorktreePr['state']; isDraft: boolean; baseRefName: string; headRefOid: string }[]
    return pr ? { branch, number: pr.number, url: pr.url, state: pr.state, isDraft: pr.isDraft, base: pr.baseRefName, headSha: pr.headRefOid } : null
  } catch {
    return null
  }
}

// The PR of every branch this repo's lifecycle keys name; one gh call per branch.
export async function check(ctx: Ctx, cwd: string): Promise<WorktreeOutcome<{ prs: WorktreePr[]; root: string; entries: WorktreeEntry[] }>> {
  const listed = await list(ctx, cwd)

  if (!listed.isDone) {
    return listed
  }

  const prs: WorktreePr[] = []

  for (const entry of listed.entries) {
    const pr = await prOf(ctx, listed.root, entry.branch)
    if (pr !== null) prs.push(pr)
  }

  return { isDone: true, prs, root: listed.root, entries: listed.entries }
}

export async function prepareClean(ctx: Ctx, args: WorktreeCleanArgs, cwd: string, sessionCwd: string): Promise<WorktreeOutcome<{ plan: WorktreeCleanPlan; lines: string[] }>> {
  const repo = await bareRepo(ctx, args.cwd ?? cwd)

  if ('isDone' in repo) {
    return repo
  }

  const { root } = repo
  const { branch } = args
  const rows = await worktrees(ctx.run, root)
  const tree = rows.find(row => row.branch === branch)
  const keys = (await lifecycleKeys(ctx.run, root)).get(branch)
  const tip = await shaOf(ctx.run, root, `refs/heads/${branch}`)

  if (tip === null) {
    return fail(`There is no local branch ${branch}.`)
  }

  if (tree !== undefined && isInside(sessionCwd, tree.path, ctx.isWindows)) {
    return fail(`This session is working inside ${tree.path}. Move the session to another folder first; a worktree in use cannot be removed.`)
  }

  if (tree !== undefined) {
    const changes = await changesAt(ctx.run, tree.path)

    if (changes.length > 0) {
      return fail(`${tree.path} has uncommitted or untracked changes (${changes.slice(0, 3).join('; ')}). Commit or discard them first.`)
    }
  }

  const pr = await prOf(ctx, root, branch)
  const base = pr?.base ?? keys?.base ?? (await defaultBranch(ctx.run, root))

  if (base === null) {
    return fail('Could not tell which branch this merged into.')
  }

  const stale = await fetchOrigin(ctx, root, base)
  const target = (await hasRef(ctx.run, root, `refs/remotes/origin/${base}`)) ? `origin/${base}` : base
  const isMergedByAncestry = await isAncestor(ctx.run, root, tip, target)
  const isMergedByPr = pr?.state === 'MERGED' && pr.headSha === tip

  if (!isMergedByAncestry && !isMergedByPr) {
    return fail(`${branch} is not merged into ${target}, and no merged PR has its tip ${tip.slice(0, 7)}. Nothing was removed.`)
  }

  const baseTree = rows.find(row => row.branch === base)
  const baseChanges = baseTree ? await changesAt(ctx.run, baseTree.path) : []
  const baseSkip = baseChanges.length > 0 ? `${baseTree?.path} has uncommitted changes, so it is not fast-forwarded` : null
  const hasRemoteRef = await hasRef(ctx.run, root, `refs/remotes/origin/${branch}`)
  const plan: WorktreeCleanPlan = { kind: 'clean', root, branch, path: tree?.path ?? null, base, baseWorktree: baseTree?.path ?? null, baseSkip, hasRemoteRef }
  const lines = [
    isMergedByAncestry ? `Merged into ${target}` : `Merged by PR #${pr?.number} (squash or rebase; its head is this branch's tip)`,
    baseSkip ?? `Fast-forward ${base}${baseTree ? ` in ${baseTree.path}` : ''}`,
    tree ? `Remove the worktree ${tree.path}` : 'The worktree is already gone',
    `Delete the branch ${branch} with -d`,
    hasRemoteRef ? `Delete the remote-tracking ref origin/${branch}` : 'No remote-tracking ref left to delete',
  ]

  if (keys?.owner !== PLUGIN && keys?.owner !== ctx.caller) {
    lines.unshift(keys?.owner ? `Created by ${keys.owner}, not by this mod` : 'Not created by this mod')
  }

  return { isDone: true, plan, lines: stale ? [...lines, stale] : lines }
}

// The four steps in the order that lets `branch -d` work: base first, worktree, branch, ref.
export async function runClean(ctx: Ctx, plan: WorktreeCleanPlan): Promise<WorktreeOutcome<{ text: string }>> {
  const done: string[] = []
  const { root } = plan

  if (plan.baseSkip !== null) {
    done.push(plan.baseSkip)
  } else if (plan.baseWorktree !== null) {
    const forwarded = await ctx.run(['git', '-C', plan.baseWorktree, 'merge', '--ff-only', `origin/${plan.base}`])
    done.push(forwarded.exitCode === 0 ? `fast-forwarded ${plan.base}` : `left ${plan.base} as it was (${firstLine(forwarded)})`)
  } else {
    const fetched = await ctx.run(['git', '-C', root, 'fetch', 'origin', `${plan.base}:${plan.base}`], { timeoutMs: 120_000 })
    done.push(fetched.exitCode === 0 ? `fast-forwarded ${plan.base}` : `left ${plan.base} as it was (${firstLine(fetched)})`)
  }

  if (plan.path !== null) {
    const removed = await ctx.run(['git', '-C', root, 'worktree', 'remove', plan.path], { timeoutMs: 120_000 })

    if (removed.exitCode !== 0) {
      return fail(`${done.join(', ')}; then git worktree remove failed: ${firstLine(removed)}. The branch is kept.`)
    }

    done.push(`removed ${plan.path}`)
  }

  const deleted = await ctx.run(['git', '-C', root, 'branch', '-d', plan.branch])

  if (deleted.exitCode !== 0) {
    return fail(`${done.join(', ')}; then git branch -d refused: ${firstLine(deleted)}. The branch and origin/${plan.branch} are kept.`)
  }

  done.push(`deleted ${plan.branch}`)

  if (plan.hasRemoteRef) {
    const pruned = await ctx.run(['git', '-C', root, 'branch', '-d', '-r', `origin/${plan.branch}`])
    done.push(pruned.exitCode === 0 ? `deleted origin/${plan.branch}` : `kept origin/${plan.branch} (${firstLine(pruned)})`)
  }

  return { isDone: true, text: `Housekept ${plan.branch}: ${done.join(', ')}.` }
}
