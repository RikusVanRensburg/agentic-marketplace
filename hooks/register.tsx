import type { EngineInterface, Register } from 'claude-code'

import type { Config, Rung } from './config'
import { configOf, rungLabel } from './config'
import type { Blocker, Effect, EndReason, Event, Report, RunState, Usage } from './engine'
import { inFlight, start, step, totals } from './engine'
import type { Run, Shell } from './git'
import { checkedOutAt, cleanForQa, createSlice, devState, integrate, isLayoutPath, removeSlice, resetSlice, tail } from './git'
import { denyOf } from './guards'
import type { Closed, Plan } from './plan'
import { reconcileProblems, validatePlan } from './plan'
import { REPORT_TOOL, SYSTEM, TOOLS, taskOf, typeName } from './prompts'

const PLUGIN = 'orchestrator'
const RUN_KEY = 'run'
const OWNER_KEY = 'owner'
const OWNED_KEY = 'owned'

type Owned = { run: string; repo: string; branch: string; path: string; kind: 'integration' | 'slice' }

// The module's copy of the stored run. The store is the record; this saves a read per event.
let current: RunState | null = null
let isOwner = false
let options: Record<string, unknown> = {}
// Events apply one at a time, in arrival order.
let chain: Promise<void> = Promise.resolve()
// Each spawn's working directory by its description, for the agent.spawn hook: the engine
// drops the cwd a plugin's spawn gives (CLI 2.1.295), and a hook's rewrite of it holds.
const pendingCwd = new Map<string, string>()

const isOurs = (agentId: string | undefined) => !!agentId && !!current && Object.values(current.agents).some(a => a.agentId === agentId)

const agentRef = (agentId: string | undefined) => (agentId && current ? Object.values(current.agents).find(a => a.agentId === agentId) : undefined)

const worktreeOf = (state: RunState, slice: string | undefined, repo: string) =>
  (slice ? state.slices[slice]?.worktree : state.integration[repo]?.path) ?? ''

const isWindowsPath = (path: string) => /^[a-zA-Z]:/.test(path)

const str = (value: unknown) => (typeof value === 'string' ? value : '')

// --- the host

function runner($: EngineInterface): Run {
  return (argv, opts) => $.process.run([...argv], { timeoutMs: 120_000, ...opts })
}

// The repo's build and test lines, run through the platform shell with no time cap.
function shell($: EngineInterface): Shell {
  return async (command, cwd) => {
    const argv = isWindowsPath(cwd) ? ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command] : ['sh', '-c', command]
    const child = $.process.spawn({ argv, cwd })
    const iterator = child[Symbol.asyncIterator]()
    let out = ''
    for (;;) {
      const next = await iterator.next()
      if (next.done) return { exitCode: next.value.code ?? 1, tail: tail(out) }
      out = (out + next.value.text).slice(-8000)
    }
  }
}

async function configNow($: EngineInterface): Promise<Config | null> {
  const result = configOf(options)
  if (!result.isValid) {
    $.ui.toast(`orchestrator settings: ${result.errors.join('; ')}`)
    return null
  }
  return result.config
}

function rungsOf(config: Config): { role: 'dev' | 'qa' | 'final-qa' | 'remediate'; rung: Rung }[] {
  return [
    ...[...config.ladders['sonnet-first'], ...config.ladders['haiku-first']].map(rung => ({ role: 'dev' as const, rung })),
    ...config.remediation.map(rung => ({ role: 'remediate' as const, rung })),
    { role: 'qa' as const, rung: config.qa },
    { role: 'final-qa' as const, rung: config.finalQa },
  ]
}

// One agent type per role and rung, so each rung carries its own effort.
async function registerTypes($: EngineInterface, config: Config): Promise<void> {
  const seen = new Set<string>()
  for (const { role, rung } of rungsOf(config)) {
    const name = typeName(role, rung)
    if (seen.has(name)) continue
    seen.add(name)
    await $.agent.register({
      name,
      description: `Orchestrator ${role} on ${rungLabel(rung)}; spawned by the orchestrator mod only`,
      prompt: SYSTEM[role],
      model: rung.model,
      effort: rung.effort,
      permissionMode: 'auto',
      tools: TOOLS[role],
    })
  }
}

// --- the event loop

function enqueue($: EngineInterface, event: Event): void {
  chain = chain.then(() => apply($, event)).catch(err => $.ui.log(`orchestrator: ${String(err)}`, { to: 'debug' }))
}

async function apply($: EngineInterface, event: Event): Promise<void> {
  if (!current || !isOwner) return
  const { state, effects } = step(current, event, Date.now())
  await save($, state)
  perform($, effects)
}

async function save($: EngineInterface, state: RunState): Promise<void> {
  current = state
  await $.store.set(RUN_KEY, state)
  showStatus($)
}

// Effects run outside the dispatch that produced them, one batch in order: a batch's effects
// depend on each other (clean before QA, reset before dev), while batches run side by side.
function perform($: EngineInterface, effects: Effect[]): void {
  if (!effects.length) return
  $.clock.after(0, () => {
    void (async () => {
      for (const effect of effects) {
        try {
          await carryOut($, effect)
        } catch (err) {
          $.ui.log(`orchestrator: ${effect.kind} failed: ${String(err)}`, { to: 'debug' })
          failed($, effect, String(err))
        }
      }
    })()
  })
}

function failed($: EngineInterface, effect: Effect, reason: string): void {
  if (effect.kind === 'create-integration') enqueue($, { kind: 'integration-failed', repo: effect.repo, reason })
  else if (effect.kind === 'create-slice') enqueue($, { kind: 'slice-failed', slice: effect.slice, reason })
  else if (effect.kind === 'spawn') enqueue($, { kind: 'spawn-failed', key: effect.key, reason })
  else if (effect.kind === 'integrate') enqueue($, { kind: 'integrated', slice: effect.slice, isMerged: false, failure: reason })
  else if (effect.kind === 'check-dev') enqueue($, { kind: 'dev-checked', slice: effect.slice, isClean: false, isAdvanced: false })
}

async function carryOut($: EngineInterface, effect: Effect): Promise<void> {
  const state = current
  if (!state) return
  const run = runner($)

  switch (effect.kind) {
    case 'create-integration':
      return createIntegration($, state, effect.repo)

    case 'create-slice': {
      const slice = state.slices[effect.slice]
      const repo = slice ? state.plan.repos[slice.repo] : undefined
      const integration = slice ? state.integration[slice.repo] : undefined
      if (!slice || !repo || !integration) return
      const made = await createSlice(run, repo.root, slice.branch, integration.branch)
      if (!made.isDone) return enqueue($, { kind: 'slice-failed', slice: slice.id, reason: made.reason })
      await own($, { run: state.id, repo: slice.repo, branch: slice.branch, path: made.path, kind: 'slice' })
      return enqueue($, { kind: 'slice-ready', slice: slice.id, path: made.path, baseSha: made.baseSha })
    }

    case 'reset-slice': {
      const slice = state.slices[effect.slice]
      if (slice?.worktree && slice.baseSha) await resetSlice(run, slice.worktree, slice.baseSha)
      return
    }

    case 'check-dev': {
      const slice = state.slices[effect.slice]
      if (!slice?.worktree || !slice.baseSha) return enqueue($, { kind: 'dev-checked', slice: effect.slice, isClean: false, isAdvanced: false })
      const checked = await devState(run, slice.worktree, slice.baseSha)
      return enqueue($, { kind: 'dev-checked', slice: slice.id, ...checked })
    }

    case 'clean-for-qa': {
      const slice = state.slices[effect.slice]
      if (slice?.worktree) await cleanForQa(run, slice.worktree, state.config.qaCleanKeep)
      return
    }

    case 'spawn':
      return spawnAgent($, state, effect)

    case 'integrate': {
      const slice = state.slices[effect.slice]
      const plan = state.plan.slices.find(s => s.id === effect.slice)
      const integration = slice ? state.integration[slice.repo] : undefined
      const repo = slice ? state.plan.repos[slice.repo] : undefined
      if (!slice || !plan || !integration?.path || !repo) return
      const message = `Merge ${slice.branch} (${slice.id} ${plan.title})`
      const merge = await integrate(run, shell($), integration.path, slice.branch, message, repo.commands)
      return enqueue($, { kind: 'integrated', slice: slice.id, ...merge })
    }

    case 'remove-slice': {
      const slice = state.slices[effect.slice]
      const repo = slice ? state.plan.repos[slice.repo] : undefined
      if (!slice?.worktree || !repo || !(await isOwned($, slice.worktree))) return
      const removed = await removeSlice(run, repo.root, slice.worktree, slice.branch)
      if (removed.isDone) await disown($, slice.worktree)
      else $.ui.toast(`orchestrator: could not remove ${slice.branch}: ${removed.reason}`)
      return
    }

    case 'close-issue':
      return closeIssue($, state, effect.slice)

    case 'blocker':
      return announce($, state, effect.blocker)

    case 'log':
      return appendLog($, state.id, effect.entry)

    case 'finished':
      return finish($, state)
  }
}

// --- worktrees

async function own($: EngineInterface, entry: Owned): Promise<void> {
  const list = ((await $.store.get(OWNED_KEY)) as Owned[] | undefined) ?? []
  await $.store.set(OWNED_KEY, [...list.filter(o => o.path !== entry.path), entry])
}

async function disown($: EngineInterface, path: string): Promise<void> {
  const list = ((await $.store.get(OWNED_KEY)) as Owned[] | undefined) ?? []
  await $.store.set(OWNED_KEY, list.filter(o => o.path !== path))
}

async function isOwned($: EngineInterface, path: string): Promise<boolean> {
  const list = ((await $.store.get(OWNED_KEY)) as Owned[] | undefined) ?? []
  return list.some(o => o.path.toLowerCase() === path.toLowerCase())
}

// The integration branch comes from the worktree-lifecycle mod, so it gets that mod's ship,
// merge notice and housekeeping. It must be green before anything merges into it, so a red
// verify later is the merge's fault.
async function createIntegration($: EngineInterface, state: RunState, repoName: string): Promise<void> {
  const repo = state.plan.repos[repoName]
  const integration = state.integration[repoName]
  if (!repo || !integration) return
  const run = runner($)
  const existing = await checkedOutAt(run, repo.root, integration.branch)
  let path: string

  if (existing) {
    if (!(await isOwned($, existing))) {
      return enqueue($, {
        kind: 'integration-failed',
        repo: repoName,
        reason: `${integration.branch} is already checked out at ${existing}, not by this run. Another session may be working there: say whether to use it, then retry.`,
      })
    }
    path = existing
  } else {
    const made = await $.worktree.create({ branch: integration.branch, base: repo.base, cwd: repo.root })
    if (!made.isDone) return enqueue($, { kind: 'integration-failed', repo: repoName, reason: made.reason })
    if (!isLayoutPath(repo.root, integration.branch, made.path)) {
      return enqueue($, { kind: 'integration-failed', repo: repoName, reason: `the integration worktree landed at ${made.path}, outside the layout` })
    }
    path = made.path
    await own($, { run: state.id, repo: repoName, branch: integration.branch, path, kind: 'integration' })
  }

  for (const [label, command] of [['build', repo.commands.build], ['test', repo.commands.test]] as const) {
    const result = await shell($)(command, path)
    if (result.exitCode !== 0) {
      return enqueue($, { kind: 'integration-failed', repo: repoName, reason: `${integration.branch} is red before any merge: ${label} exited ${result.exitCode}: ${result.tail}` })
    }
  }

  enqueue($, { kind: 'integration-ready', repo: repoName, path })
}

// --- agents

async function spawnAgent($: EngineInterface, state: RunState, effect: Extract<Effect, { kind: 'spawn' }>): Promise<void> {
  const cwd = worktreeOf(state, effect.slice, effect.repo)
  const description = `orch ${effect.slice ?? `final ${effect.repo}`} ${effect.role} r${effect.round} #${effect.key.split(':').pop()}`
  pendingCwd.set(description, cwd)
  const spawned = await $.agent.spawn({
    subagentType: `${PLUGIN}:${typeName(effect.role, effect.rung)}`,
    description,
    prompt: taskOf(state, effect.role, effect.repo, effect.slice, effect.round, effect.rung),
  })
  pendingCwd.delete(description)
  if (spawned.deny !== undefined || !spawned.agentId) {
    return enqueue($, { kind: 'spawn-failed', key: effect.key, reason: spawned.deny ?? 'no agent id' })
  }
  enqueue($, { kind: 'spawned', key: effect.key, agentId: spawned.agentId })
}

function reportOf(kind: string, input: Record<string, unknown>): Report | string {
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])
  if (kind === 'dev') return { kind, committed: input.committed === true, summary: str(input.summary), newApis: str(input.newApis), todos: str(input.todos) }
  if (kind === 'qa') return typeof input.pass === 'boolean' ? { kind, pass: input.pass, defects: list(input.defects) } : 'qa needs pass'
  if (kind === 'final-qa') return typeof input.pass === 'boolean' ? { kind, pass: input.pass, findings: list(input.findings) } : 'final-qa needs pass'
  if (kind === 'remediate') return { kind, committed: input.committed === true, summary: str(input.summary) }
  return `unknown kind "${kind}"`
}

// --- the tracker, the person, the log

function repoSlugOf(state: RunState): string | null {
  const source = state.plan.source
  return source.kind === 'github' ? (/github\.com\/([^/]+\/[^/]+)\/issues/.exec(source.parent)?.[1] ?? null) : null
}

async function closeIssue($: EngineInterface, state: RunState, slice: string): Promise<void> {
  const repo = repoSlugOf(state)
  if (!repo) return
  const closed = await $.process.run(['gh', 'issue', 'close', slice, '--repo', repo, '--reason', 'completed'], { timeoutMs: 60_000 })
  if (closed.exitCode !== 0) $.ui.toast(`orchestrator: could not close #${slice}: ${closed.stderr.trim()}`)
}

function blockerText(state: RunState, blocker: Blocker): string {
  return [
    `## Blocked by the orchestrator run ${state.id}`,
    '',
    `- **Reason:** ${blocker.reason}`,
    blocker.rung ? `- **Rung it stopped on:** ${blocker.rung}` : '',
    blocker.worktree ? `- **Worktree kept:** \`${blocker.worktree}\`` : '',
    blocker.defects?.length ? `\n### Still open\n\n${blocker.defects.map(d => `- ${d}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')
}

// Blockers reach the person while the run goes on: a toast, the status line, and a message
// to this session so its model can ask them. A slice blocker is also put on its issue.
async function announce($: EngineInterface, state: RunState, blocker: Blocker): Promise<void> {
  $.ui.toast(`orchestrator: ${blocker.at} blocked: ${blocker.reason}`)
  const repo = repoSlugOf(state)
  if (repo && /^\d+$/.test(blocker.at)) {
    await $.process.run(['gh', 'issue', 'comment', blocker.at, '--repo', repo, '--body-file', '-'], { stdin: blockerText(state, blocker), timeoutMs: 60_000 })
  }
  void $.prompt.submit({
    text: [
      `[orchestrator] ${blocker.at} is blocked and its chain has stopped; the rest of run ${state.id} keeps going.`,
      blockerText(state, blocker),
      `Ask me how to proceed. My answer goes back with: /orchestrator retry ${blocker.at} <answer>`,
    ].join('\n\n'),
  })
}

async function logPath($: EngineInterface, run: string): Promise<string> {
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || '.'
  return `${home.replace(/\\/g, '/')}/.claude/orchestrator/runs/${run}.jsonl`
}

async function appendLog($: EngineInterface, run: string, entry: unknown): Promise<void> {
  const path = await logPath($, run)
  let before = ''
  try {
    if (await $.fs.exists(path)) before = String(await $.fs.read(path))
  } catch {
    before = ''
  }
  await $.fs.write(path, `${before}${JSON.stringify({ ...(entry as object), at: new Date().toISOString() })}\n`)
}

async function finish($: EngineInterface, state: RunState): Promise<void> {
  const t = totals(state, Date.now())
  const finals = Object.values(state.finals).map(f => `${f.repo}: final QA ${f.phase}`).join(', ')
  $.ui.toast(`orchestrator: run ${state.id} finished, ${t.merged}/${t.slices} merged, ${t.blocked} blocked`)
  void $.prompt.submit({
    text: [
      `[orchestrator] Run ${state.id} (${state.plan.title}) finished: ${t.merged} of ${t.slices} slices merged, ${t.blocked} blocked. ${finals}.`,
      `Integration branches: ${Object.entries(state.integration).map(([r, i]) => `${r} ${i.branch}`).join(', ')}. Nothing is pushed.`,
      'Summarise the run for me from orchestrator_status. Pushing and the PR wait for my yes; on yes, prepare them with the worktree-lifecycle ship.',
    ].join('\n'),
  })
}

function showStatus($: EngineInterface): void {
  if (!current) return $.ui.status(undefined)
  const t = totals(current, Date.now())
  const tail = current.status === 'running' ? `${t.running} agent${t.running === 1 ? '' : 's'}` : current.status
  $.ui.status(`orch ${current.plan.slug} ${t.merged}/${t.slices} merged${t.blocked ? ` · ${t.blocked} blocked` : ''} · ${tail}`)
}

function statusText(state: RunState): string {
  const t = totals(state, Date.now())
  const lines = [
    `Run ${state.id} (${state.plan.title}): ${state.status}, ${t.merged}/${t.slices} merged, ${t.blocked} blocked, ${t.running} agents running, ${t.tokens} tokens.`,
    ...state.order.map(id => {
      const s = state.slices[id]
      if (!s) return ''
      const last = s.rounds.at(-1)
      return `- ${id} ${s.phase} (${s.mode}, round ${s.round}${last ? `, last ${last.role} ${rungLabel(last.rung)} ${last.verdict ?? 'running'}` : ''})${s.blocker ? `: ${s.blocker}` : ''}`
    }),
    ...Object.values(state.finals).map(f => `- final QA ${f.repo}: ${f.phase}${f.findings.length ? `, ${f.findings.length} findings` : ''}`),
    ...state.blockers.map(b => `BLOCKER ${b.at}: ${b.reason}${b.worktree ? ` (worktree ${b.worktree})` : ''}`),
  ]
  return lines.filter(Boolean).join('\n')
}

// --- launch and resume

async function closedIssues($: EngineInterface, plan: Plan): Promise<Closed | string> {
  if (plan.source.kind !== 'github') return { completed: [], other: [] }
  const repo = /github\.com\/([^/]+\/[^/]+)\/issues/.exec(plan.source.parent)?.[1]
  const closed: Closed = { completed: [], other: [] }
  for (const slice of plan.slices) {
    const viewed = await $.process.run(['gh', 'issue', 'view', slice.id, '--repo', repo ?? '', '--json', 'state,stateReason'], { timeoutMs: 60_000 })
    if (viewed.exitCode !== 0) return `cannot read issue ${slice.id}: ${viewed.stderr.trim()}`
    const info = JSON.parse(viewed.stdout) as { state?: string; stateReason?: string }
    if (String(info.state).toUpperCase() !== 'CLOSED') continue
    if (String(info.stateReason).toUpperCase() === 'COMPLETED') closed.completed.push(slice.id)
    else closed.other.push(slice.id)
  }
  return closed
}

async function launch($: EngineInterface, input: unknown): Promise<string> {
  if (current?.status === 'running') return `Run ${current.id} is still running. Abort it with /orchestrator abort first.`
  const config = await configNow($)
  if (!config) return 'The orchestrator settings are invalid; see the toast.'
  const checked = validatePlan(input, config)
  if (!checked.isValid) return `Refused, nothing started:\n${checked.errors.map(e => `- ${e}`).join('\n')}`
  const closed = await closedIssues($, checked.plan)
  if (typeof closed === 'string') return `Refused, nothing started: ${closed}`
  const problems = reconcileProblems(checked.plan, closed)
  if (problems.length) return `Refused, the plan no longer matches the tracker:\n${problems.map(p => `- ${p}`).join('\n')}`

  await registerTypes($, config)
  const id = `${checked.plan.slug}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`
  const begun = start(checked.plan, config, closed, id, Date.now())
  isOwner = true
  await $.store.set(OWNER_KEY, await $.session.id())
  await save($, begun.state)
  perform($, begun.effects)
  return `Launched run ${id}: ${checked.plan.slices.length} slices${closed.completed.length ? `, ${closed.completed.join(', ')} already landed` : ''}. Blockers will reach this session as they happen.`
}

// A reload or a new session: agents the engine no longer runs are lost, and the effects that
// were running in the old module go again.
async function resume($: EngineInterface): Promise<void> {
  if (!current || current.status !== 'running') return
  const listed = await $.agent.list()
  const alive = new Set(listed.filter(a => a.status === 'running' || a.status === 'pending' || a.status === 'waiting').map(a => a.id))
  for (const ref of Object.values(current.agents)) {
    if (!ref.agentId) enqueue($, { kind: 'spawn-failed', key: ref.key, reason: 'the module reloaded before the agent started' })
    else if (!alive.has(ref.agentId)) enqueue($, { kind: 'ended', agentId: ref.agentId, reason: 'lost' })
  }
  perform($, inFlight(current))
}

const usageOf = (u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined): Usage | undefined =>
  u ? { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 } : undefined

// A stray `isolation: 'worktree'` agent lands inside the layout: `<repo>/<name>`, branch `name`.
async function layoutWorktree($: EngineInterface, cwd: string, name: string): Promise<string | null> {
  const run = runner($)
  const common = await run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd })
  const dir = common.stdout.trim().replace(/\\/g, '/')
  if (common.exitCode !== 0 || !dir.endsWith('/.bare')) return null
  const root = dir.slice(0, -'/.bare'.length)
  const head = await run(['git', 'rev-parse', 'HEAD'], { cwd })
  const path = `${root}/${name}`
  const added = await run(['git', '-C', root, 'worktree', 'add', '-b', name, path, head.stdout.trim() || 'HEAD'])
  return added.exitCode === 0 ? path : null
}

// --- hooks

export const register: Register = (on, opts) => {
  options = (opts ?? {}) as Record<string, unknown>

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const config = await configNow($)
    current = ((await $.store.get(RUN_KEY)) as RunState | undefined) ?? null
    isOwner = !!current && (await $.store.get(OWNER_KEY)) === (await $.session.id())

    if (config) await registerTypes($, config)
    if (current) await registerTypes($, current.config)

    await $.tool.register({
      name: 'launch',
      description: 'Starts an orchestrator run from a plan the orchestrate skill prepared. Refuses, starting nothing, on any problem in the plan.',
      inputSchema: { type: 'object', properties: { plan: { type: 'object' } }, required: ['plan'] },
    })
    await $.tool.register({
      name: 'status',
      description: 'The current orchestrator run: each slice, its phase and rounds, final QA, and every blocker.',
    })
    await $.tool.register({
      name: 'report',
      description: 'Orchestrator agents report their result here, once, at the end. Not for the main session.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['dev', 'qa', 'final-qa', 'remediate'] },
          committed: { type: 'boolean' },
          pass: { type: 'boolean' },
          summary: { type: 'string' },
          newApis: { type: 'string' },
          todos: { type: 'string' },
          defects: { type: 'array', items: { type: 'string' } },
          findings: { type: 'array', items: { type: 'string' } },
        },
        required: ['kind'],
      },
      isDeferred: false,
    })
    await $.command.register({ name: 'orchestrator', description: 'Orchestrator run: status, retry <at> <answer>, abort, take' })

    if (current?.status === 'running') {
      if (isOwner) await resume($)
      else $.ui.status(`orch ${current.plan.slug}: running in another session (/orchestrator take to drive it here)`)
    }
    showStatus($)
    return started
  })

  on('agent.offer', ($, e, next) => (e.agent.startsWith(`${PLUGIN}:`) ? { isOffered: false } : next(e)))

  // The mod approves its own spawns of its own agent types and nothing else: in auto mode a
  // plugin's spawn has no model request for the classifier to judge (ADR 0004).
  on('tool.check', { tool: 'Agent' }, async ($, e, next) => {
    const input = (e.input ?? {}) as { subagent_type?: unknown; subagentType?: unknown }
    const type = str(input.subagent_type) || str(input.subagentType)
    if (next.origin.plugin === PLUGIN && type.startsWith(`${PLUGIN}:`)) return { decision: 'allow', reason: 'the orchestrator spawns its own agent types' }
    return next(e)
  })

  on('agent.spawn', ($, e, next) => {
    const cwd = pendingCwd.get(e.description)
    return cwd && e.subagentType.startsWith(`${PLUGIN}:`) ? next({ ...e, cwd }) : next(e)
  })

  // Whatever the mode or the person's allow rules, the mod's agents do not push, write to the
  // tracker, touch branches or worktrees, or leave their worktree.
  on('tool.call', async ($, e, next) => {
    const ref = agentRef(e.agentId)
    if (!ref || !current) return next(e)
    const why = denyOf(e.tool, e as unknown as Record<string, unknown>, worktreeOf(current, ref.slice, ref.repo))
    return why ? { deny: `orchestrator: ${why}` } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : isOurs(e.agentId) ? { deny: 'orchestrator: its guard failed' } : next(e)))

  on('tool.call', { tool: 'mcp__orchestrator__report' }, async ($, e) => {
    const input = e as unknown as Record<string, unknown>
    if (!isOurs(e.agentId) || !e.agentId) return { result: 'Only orchestrator agents report here.' }
    const report = reportOf(str(input.kind), input)
    if (typeof report === 'string') return { result: `Not recorded: ${report}. Call again with a valid report.` }
    enqueue($, { kind: 'report', agentId: e.agentId, report })
    return { result: 'Recorded. Answer DONE.' }
  })

  on('tool.call', { tool: 'mcp__orchestrator__launch' }, async ($, e) => ({ result: await launch($, (e as unknown as { plan: unknown }).plan) }))

  on('tool.call', { tool: 'mcp__orchestrator__status' }, async () => ({ result: current ? statusText(current) : 'No orchestrator run.' }))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId && isOurs(e.agentId)) {
      const reason: EndReason = e.reason === 'answer' || e.reason === 'aborted' || e.reason === 'refusal' ? e.reason : 'error'
      enqueue($, { kind: 'ended', agentId: e.agentId, reason, durationMs: e.durationMs, ...(e.usage ? { usage: usageOf(e.usage) as Usage } : {}) })
    }
    return next(e)
  })

  on('classic.WorktreeCreate', async ($, e, next) => {
    const path = await layoutWorktree($, e.cwd, e.name)
    return path ? { worktreePath: path } : next(e)
  })

  on('command.run', { command: 'orchestrator' }, async ($, e) => {
    const [verb = 'status', at = '', ...rest] = e.args.trim().split(/\s+/)
    if (verb === 'take') {
      if (!current || current.status !== 'running') return { text: 'No running orchestrator run.' }
      isOwner = true
      await $.store.set(OWNER_KEY, await $.session.id())
      await resume($)
      return { text: `This session now drives run ${current.id}.` }
    }
    if (!current) return { text: 'No orchestrator run.' }
    if (verb === 'abort') {
      enqueue($, { kind: 'abort' })
      return { text: `Run ${current.id} stops starting work. Agents already running finish on their own; their worktrees stay.` }
    }
    if (verb === 'retry') {
      if (!at || !rest.length) return { text: 'Usage: /orchestrator retry <slice | final:<repo> | integration:<repo>> <answer>' }
      enqueue($, { kind: 'retry', at, answer: rest.join(' ') })
      return { text: `${at} goes again with your answer.` }
    }
    return { text: statusText(current) }
  })
}
