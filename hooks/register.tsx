import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity, SliceRow } from '../types'

import type { Config, Rung } from './config'
import { configOf, rungLabel } from './config'
import type { Blocker, Effect, EndReason, Event, Report, RunState, Usage } from './engine'
import { inFlight, start, step, totals } from './engine'
import type { Run, Shell } from './git'
import { checkedOutAt, cleanForQa, createSlice, devState, integrate, isLayoutPath, removeSlice, resetSlice, tail } from './git'
import { denyOf } from './guards'
import type { Closed, Plan } from './plan'
import { overlapProblems, reconcileProblems, validatePlan } from './plan'
import { SYSTEM, TOOLS, taskOf, typeName } from './prompts'
import type { LogRow } from './stats'
import { parseLog, statsText } from './stats'
import { BAND_H, HEADER_H, LINE_H, PROGRESS_H, activitySvg, bandCounts, bandLabel, bandSvg, blockerSvg, finalLine, headerSvg, mergedLine, progressSvg, waitingLine } from './draw'
import { bar, fmtTime, fmtTokens, taskNameOf, viewOf } from './view'

const PLUGIN = 'orchestrator'
const RUN_KEY = 'run'
const OWNER_KEY = 'owner'
const OWNED_KEY = 'owned'
const PANE = 'orchestrator-run'

const viewAtom = atom({ plugin: 'orchestrator', key: 'view' } as const, null)
const uiAtom = atom({ plugin: 'orchestrator', key: 'ui' } as const, { expanded: null, isDoneCollapsed: true, isBandHidden: false, pulse: 0 })
const activityAtom = atom({ plugin: 'orchestrator', key: 'activity' } as const, {})

type Owned = { run: string; repo: string; branch: string; path: string; kind: 'integration' | 'slice' }

// The module's copy of the stored run. The store is the record; this saves a read per event.
let current: RunState | null = null
let isOwner = false
let options: Record<string, unknown> = {}
// Redraws the elapsed times while a run is going.
let ticker: { cancel: () => void } | null = null
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

// The mod's own spawn: one of its agent types, with the description it registered just before.
const isOwnSpawn = (raw: unknown) => {
  const input = (raw ?? {}) as { subagent_type?: unknown; subagentType?: unknown; description?: unknown }
  const type = str(input.subagent_type) || str(input.subagentType)
  return type.startsWith(`${PLUGIN}:`) && pendingCwd.has(str(input.description))
}
const APPROVED = { decision: 'allow' as const, reason: 'the orchestrator spawns its own agent types' }
// Spawns wait here until a hook of the mod is running: the engine leaves the mod's own hooks
// (spawn approval, the worktree as cwd) out of a spawn made from a timer, so every spawn is
// made inside a live hook. Renders of the band and pane, the agents' calls and turn ends,
// the commands and launch all drain it.
const pendingSpawns: Extract<Effect, { kind: 'spawn' }>[] = []
let isFlushing = false
// Hand-backs of the mod's agents answered by the mod instead of reaching the session.
let handbacksHeld = 0

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

function rungsOf(config: Config): { role: 'dev' | 'qa' | 'final-qa' | 'remediate' | 'resolve'; rung: Rung }[] {
  const devRungs = [...config.ladders['sonnet-first'], ...config.ladders['haiku-first']]
  return [
    ...devRungs.map(rung => ({ role: 'dev' as const, rung })),
    ...devRungs.map(rung => ({ role: 'resolve' as const, rung })),
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
  chain = chain.then(() => apply($, event, false)).catch(err => $.ui.log(`orchestrator: ${String(err)}`, { to: 'debug' }))
}

// For a hook that is still running: the event applies now, and its spawns happen inside the
// hook's own dispatch, where the engine still runs the mod's spawn hooks.
async function applyNow($: EngineInterface, event: Event): Promise<void> {
  const turn = chain.then(() => apply($, event, true))
  chain = turn.catch(err => $.ui.log(`orchestrator: ${String(err)}`, { to: 'debug' }))
  await turn
}

async function apply($: EngineInterface, event: Event, isLive: boolean): Promise<void> {
  if (!current || !isOwner) return
  const { state, effects } = step(current, event, Date.now())
  await save($, state)
  if (!isLive) return perform($, effects)
  // Spawns now, in order; the rest of the batch keeps its order in the background.
  const later: Effect[] = []
  for (const effect of effects) {
    if (effect.kind === 'spawn' && !later.length) pendingSpawns.push(effect)
    else later.push(effect)
  }
  await flushSpawns($)
  perform($, later)
}

async function flushSpawns($: EngineInterface): Promise<void> {
  if (isFlushing || !pendingSpawns.length) return
  isFlushing = true
  try {
    while (pendingSpawns.length) {
      const effect = pendingSpawns.shift() as Extract<Effect, { kind: 'spawn' }>
      await carryOut($, effect).catch(err => failed($, effect, String(err)))
    }
  } finally {
    isFlushing = false
  }
}

async function save($: EngineInterface, state: RunState): Promise<void> {
  current = state
  await $.store.set(RUN_KEY, state)
  await redraw($)
}

async function redraw($: EngineInterface): Promise<void> {
  showStatus($)
  const state = current
  await update($, viewAtom, () => (state ? viewOf(state, Date.now()) : null))
  if (state?.status === 'running' && !ticker) ticker = $.clock.every(5000, () => void redraw($))
  if (state?.status !== 'running' && ticker) {
    ticker.cancel()
    ticker = null
  }
}

// Effects run outside the dispatch that produced them, one batch in order: a batch's effects
// depend on each other (clean before QA, reset before dev), while batches run side by side.
function perform($: EngineInterface, effects: Effect[]): void {
  if (!effects.length) return
  $.clock.after(0, () => {
    void (async () => {
      for (const effect of effects) {
        if (effect.kind === 'spawn') {
          pendingSpawns.push(effect)
          await update($, uiAtom, prev => ({ ...prev, pulse: (prev.pulse ?? 0) + 1 }))
          continue
        }
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
      const integration = state.integration[slice.repo]?.branch ?? ''
      const removed = await removeSlice(run, repo.root, slice.worktree, slice.branch, integration)
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
  const description = taskNameOf(effect)
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
  if (kind === 'qa') {
    if (typeof input.pass !== 'boolean') return 'qa needs pass'
    const criteria = Array.isArray(input.criteria)
      ? input.criteria
          .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
          .map(c => ({ slice: str(c.slice), met: c.met === true, ...(str(c.note) ? { note: str(c.note) } : {}) }))
      : undefined
    return { kind, pass: input.pass, defects: list(input.defects), ...(criteria ? { criteria } : {}) }
  }
  if (kind === 'final-qa') return typeof input.pass === 'boolean' ? { kind, pass: input.pass, findings: list(input.findings) } : 'final-qa needs pass'
  if (kind === 'remediate') return { kind, committed: input.committed === true, summary: str(input.summary) }
  if (kind === 'resolve') return { kind, resolved: input.resolved === true, summary: str(input.summary), conflict: str(input.conflict) }
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
  await openPane($)
  const repo = repoSlugOf(state)
  if (repo && /^\d+$/.test(blocker.at)) {
    await $.process.run(['gh', 'issue', 'comment', blocker.at, '--repo', repo, '--body-file', '-'], { stdin: blockerText(state, blocker), timeoutMs: 60_000 })
  }
  void $.prompt.submit({
    text: [
      `[orchestrator] ${blocker.at} is blocked and its chain has stopped${Object.keys(state.agents).length || state.queue.length || state.integrating ? `; the rest of run ${state.id} keeps going` : ''}.`,
      blockerText(state, blocker),
      `Ask me how to proceed. My answer goes back with: /orchestrator retry ${blocker.at} <answer>`,
    ].join('\n\n'),
  })
}

// The pane comes up by itself whenever a run starts, resumes or blocks.
async function openPane($: EngineInterface): Promise<void> {
  if (!(await $.ui.panes()).some(p => p.id === PANE)) await $.ui.open({ id: PANE, title: 'Orchestrator' })
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

// Every run's round log, summarised by start mode and by rung.
async function statsOfLogs($: EngineInterface): Promise<string> {
  const dir = (await logPath($, 'x')).replace(/\/x\.jsonl$/, '')
  let rows: LogRow[] = []
  try {
    for (const entry of await $.fs.list(dir)) {
      if (!entry.name.endsWith('.jsonl')) continue
      rows = rows.concat(parseLog(String(await $.fs.read(`${dir}/${entry.name}`))))
    }
  } catch {
    return 'No orchestrator rounds logged yet.'
  }
  return statsText(rows)
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
    `Agent hand-backs held back from this session since the mod loaded: ${handbacksHeld}.`,
  ]
  return lines.filter(Boolean).join('\n')
}

// --- the drill-in

// A tool call in a few words: the command, the file relative to the worktree, the pattern.
function summaryOf(input: Record<string, unknown>, worktree: string): string {
  const rel = (path: string) => {
    const p = path.replace(/\\/g, '/')
    const w = worktree.replace(/\\/g, '/').replace(/\/$/, '')
    return p.toLowerCase().startsWith(`${w.toLowerCase()}/`) ? p.slice(w.length + 1) : p
  }
  const first = [input.command, input.file_path, input.notebook_path, input.pattern, input.path, input.description].find(v => typeof v === 'string' && v.trim())
  return typeof first === 'string' ? rel(first).replace(/\s+/g, ' ').slice(0, 120) : ''
}

async function record($: EngineInterface, at: string, agentId: string, task: string, text: string): Promise<void> {
  await update($, activityAtom, prev => {
    const before: Activity | undefined = prev[at]
    const lines = before && before.agentId === agentId ? before.lines : []
    return { ...prev, [at]: { agentId, task, lines: [...lines, { at: Date.now(), text }].slice(-20) } }
  })
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
  const overlaps = checked.plan.allowOverlap ? [] : overlapProblems(checked.plan)
  if (overlaps.length) {
    return `Refused, nothing started. These slices would conflict on merge:\n${overlaps.map(o => `- ${o}`).join('\n')}\nAdd a dependency between each pair, or set allowOverlap: true to run them side by side and let conflicts go to the resolve agent.`
  }
  const problems = reconcileProblems(checked.plan, closed)
  if (problems.length) return `Refused, the plan no longer matches the tracker:\n${problems.map(p => `- ${p}`).join('\n')}`

  await registerTypes($, config)
  const id = `${checked.plan.slug}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`
  const begun = start(checked.plan, config, closed, id, Date.now())
  isOwner = true
  await $.store.set(OWNER_KEY, await $.session.id())
  await save($, begun.state)
  perform($, begun.effects)
  await flushSpawns($)
  await openPane($)
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
  await openPane($)
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
          kind: { type: 'string', enum: ['dev', 'qa', 'final-qa', 'remediate', 'resolve'] },
          committed: { type: 'boolean' },
          resolved: { type: 'boolean' },
          conflict: { type: 'string' },
          pass: { type: 'boolean' },
          summary: { type: 'string' },
          newApis: { type: 'string' },
          todos: { type: 'string' },
          defects: { type: 'array', items: { type: 'string' } },
          criteria: {
            type: 'array',
            items: { type: 'object', properties: { slice: { type: 'string' }, met: { type: 'boolean' }, note: { type: 'string' } }, required: ['slice', 'met'] },
          },
          findings: { type: 'array', items: { type: 'string' } },
        },
        required: ['kind'],
      },
      isDeferred: false,
    })
    await $.command.register({ name: 'orchestrator', description: 'Orchestrator run: status, pane, stats, retry <at> <answer>, drop <slice>, abort, take' })

    if (current?.status === 'running') {
      if (isOwner) await resume($)
      else $.ui.status(`orch ${current.plan.slug}: running in another session (/orchestrator take to drive it here)`)
    }
    await redraw($)
    return started
  })

  on('agent.offer', ($, e, next) => (e.agent.startsWith(`${PLUGIN}:`) ? { isOffered: false } : next(e)))

  // The mod approves its own spawns of its own agent types and nothing else: in auto mode a
  // plugin's spawn has no model request for the classifier to judge (ADR 0004).
  // The spawn is recognised as the mod's own by its description, registered just before the
  // spawn: a spawn made from a timer does not carry the mod as its origin.
  // Reached as a re-entry, the handler decides from the event alone.
  on('tool.check', { tool: 'Agent' }, ($, e, next) => (isOwnSpawn(e.input) ? APPROVED : next(e))).catch(($, e, next) =>
    isOwnSpawn(e.input) ? APPROVED : next(e),
  )

  on('agent.spawn', ($, e, next) => {
    const cwd = pendingCwd.get(e.description)
    return cwd && e.subagentType.startsWith(`${PLUGIN}:`) ? next({ ...e, cwd }) : next(e)
  }).catch(($, e, next) => next(e))

  // Whatever the mode or the person's allow rules, the mod's agents do not push, write to the
  // tracker, touch branches or worktrees, or leave their worktree.
  on('tool.call', async ($, e, next) => {
    const ref = agentRef(e.agentId)
    if (!ref || !current) return next(e)
    if (e.tool === 'SubagentHandback') {
      // The report tool already carries the result; the hand-back would only land in the
      // session as one more message per agent.
      handbacksHeld += 1
      return { result: 'The orchestrator already has your report. Your turn is done.' }
    }
    const worktree = worktreeOf(current, ref.slice, ref.repo)
    const why = denyOf(e.tool, e as unknown as Record<string, unknown>, worktree)
    if (why) return { deny: `orchestrator: ${why}` }
    await flushSpawns($)
    await record($, ref.slice ?? `final:${ref.repo}`, ref.agentId ?? '', taskNameOf(ref), `${e.tool} ${summaryOf(e as unknown as Record<string, unknown>, worktree)}`)
    return next(e)
  }).catch(($, e, next) => {
    const ref = agentRef(e.agentId)
    if (!ref || !current) return next(e)
    if (next.error.kind === 're-entry') {
      // Reached as a re-entry: run the guard's own check from the event alone.
      const why = denyOf(e.tool, e as unknown as Record<string, unknown>, worktreeOf(current, ref.slice, ref.repo))
      return why ? { deny: `orchestrator: ${why}` } : next(e)
    }
    return next.called ? next(e) : { deny: 'orchestrator: its guard failed' }
  })

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
    await flushSpawns($)
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
    await flushSpawns($)
    const [verb = 'status', at = '', ...rest] = e.args.trim().split(/\s+/)
    if (verb === 'stats') return { text: await statsOfLogs($) }
    if (verb === 'take') {
      if (!current || current.status !== 'running') return { text: 'No running orchestrator run.' }
      isOwner = true
      await $.store.set(OWNER_KEY, await $.session.id())
      await resume($)
      return { text: `This session now drives run ${current.id}.` }
    }
    if (!current) return { text: 'No orchestrator run.' }
    if (verb === 'pane') {
      await $.ui.open({ id: PANE, title: 'Orchestrator' })
      return { text: 'Orchestrator pane opened.' }
    }
    if (verb === 'abort') {
      enqueue($, { kind: 'abort' })
      return { text: `Run ${current.id} stops starting work. Agents already running finish on their own; their worktrees stay.` }
    }
    if (verb === 'drop') {
      if (!at) return { text: 'Usage: /orchestrator drop <slice>' }
      await applyNow($, { kind: 'drop', slice: at })
      return { text: `${at} is dropped from run ${current.id}. Anything that depends on it stays halted until you drop or retry it.` }
    }
    if (verb === 'retry') {
      if (!at || !rest.length) return { text: 'Usage: /orchestrator retry <slice | final:<repo> | integration:<repo>> <answer>' }
      await applyNow($, { kind: 'retry', at, answer: rest.join(' ') })
      return { text: `${at} goes again with your answer.` }
    }
    return { text: statusText(current) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await flushSpawns($)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const view = await read($, viewAtom)
    const paneUi = await read($, uiAtom)
    const activity = await read($, activityAtom)
    if (!view) return <Text dimColor>No orchestrator run.</Text>

    const rows = (group: string) => view.rows.filter(r => r.group === group)
    const blocked = rows('blocked')
    const going = [...rows('build'), ...rows('integrate')]
    const next = rows('waiting')
    const merged = rows('done')
    const toggle = (id: string) => update($, uiAtom, prev => ({ ...prev, expanded: prev.expanded === id ? null : id }))

    // The drill-in reads the agent's latest message only for the row that is open.
    const open = paneUi.expanded
    const openRow = view.rows.find(r => r.id === open)
    const openFinal = view.finals.find(f => `final:${f.repo}` === open)
    const openAgent = openRow?.agentId ?? openFinal?.agentId ?? null
    let latest = ''
    if (openAgent) {
      try {
        const messages = await $.session.messages({ agentId: openAgent })
        latest = [...messages].reverse().find(m => m.role === 'assistant' && m.text.trim())?.text.trim() ?? ''
      } catch {
        latest = ''
      }
    }
    const footerOf = (r: SliceRow) => [...(r.worktree ? [`worktree ${r.worktree}`] : []), `branch ${r.branch}`, ...r.history]
    const detailsButton = (id: string) => (
      <Button key={`row-${id}`} label={open === id ? '▾ details' : '▸ details'} plain onPress={() => toggle(id)} />
    )
    const mergedToggle =
      merged.length > 0 ? (
        <Button
          key="done"
          label={`${paneUi.isDoneCollapsed ? '▸' : '▾'} Merged · ${merged.length}`}
          plain
          onPress={() => update($, uiAtom, prev => ({ ...prev, isDoneCollapsed: !prev.isDoneCollapsed }))}
        />
      ) : null
    const label = (key: string, s: string) => (
      <Text key={key} dimColor>
        {s}
      </Text>
    )

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 60) * 8 - 8))
      const drill = (key: string, agentKey: string, footer: string[]) => {
        const d = activitySvg(W, activity[agentKey], latest, footer)
        return <Svg key={key} source={d.svg} alt={`${agentKey} details`} width={W} height={d.height} />
      }
      return (
        <Box flexDirection="column" gap={1}>
          <Svg source={headerSvg(W, view)} alt={`${view.title}: ${view.status}, ${view.merged} of ${view.slices} merged, ${view.blocked} blocked`} width={W} height={HEADER_H} />
          {blocked.length > 0 && label('h-blocked', `Needs you · ${blocked.length}`)}
          {blocked.map(r => {
            const card = blockerSvg(W, r)
            return (
              <Box key={`b-${r.id}`} flexDirection="column">
                <Svg source={card.svg} alt={`${r.id} ${r.title} blocked: ${r.blocker ?? ''}`} width={W} height={card.height} />
                {detailsButton(r.id)}
                {open === r.id && drill(`d-${r.id}`, r.id, footerOf(r))}
              </Box>
            )
          })}
          {going.length > 0 && label('h-going', `In progress · ${going.length}`)}
          {going.map(r => (
            <Box key={`p-${r.id}`} flexDirection="column">
              <Svg source={progressSvg(W, r)} alt={`${r.id} ${r.title}: ${r.phase}, ${r.role ?? ''} ${r.rung ?? ''}`} width={W} height={PROGRESS_H} />
              {detailsButton(r.id)}
              {open === r.id && drill(`d-${r.id}`, r.id, footerOf(r))}
            </Box>
          ))}
          {next.length > 0 && label('h-next', `Up next · ${next.length}`)}
          {next.map(r => (
            <Svg key={`n-${r.id}`} source={waitingLine(W, r)} alt={`${r.id} ${r.title} waiting`} width={W} height={LINE_H} />
          ))}
          {mergedToggle}
          {!paneUi.isDoneCollapsed && merged.map(r => <Svg key={`m-${r.id}`} source={mergedLine(W, r)} alt={`${r.id} ${r.title} merged`} width={W} height={LINE_H} />)}
          {label('h-final', 'Final QA')}
          {view.finals.map(f => (
            <Box key={`f-${f.repo}`} flexDirection="column">
              <Svg source={finalLine(W, f)} alt={`final QA ${f.repo}: ${f.phase}`} width={W} height={LINE_H} />
              {(f.agentId || f.findings.length > 0) && detailsButton(`final:${f.repo}`)}
              {open === `final:${f.repo}` && drill(`d-final-${f.repo}`, `final:${f.repo}`, [...f.findings.slice(0, 6), ...f.history])}
            </Box>
          ))}
        </Box>
      )
    }

    // Terminal and the other surfaces: the same sections in text rows.
    const cols = Math.max(30, e.props.bodyColumns || 60)
    const trackW = Math.max(3, Math.min(8, Math.floor((cols - 20) / 3)))
    const line = (key: string, left: JSX.Element, rightText: string) => (
      <Box key={key} flexDirection="row" justifyContent="space-between">
        {left}
        <Text dimColor>{rightText}</Text>
      </Box>
    )
    const indent = (key: string, s: string, color?: string) => (
      <Text key={key} color={color} dimColor={!color} wrap="truncate-end">
        {'    '}
        {s}
      </Text>
    )
    const drillText = (key: string, agentKey: string, footer: string[]) => {
      const a = activity[agentKey]
      const now = Date.now()
      return (
        <Box key={key} flexDirection="column" marginBottom={1}>
          {a && indent(`${key}-task`, a.task)}
          {(a?.lines ?? []).slice(-8).map((l, i) => indent(`${key}-a${i}`, `${fmtTime(Math.max(0, now - l.at)).padStart(4)}  ${l.text}`))}
          {latest && indent(`${key}-latest`, `latest: ${latest.replace(/\s+/g, ' ').slice(0, cols * 2)}`)}
          {footer.map((f, i) => indent(`${key}-f${i}`, f))}
        </Box>
      )
    }
    const track = (r: SliceRow) =>
      ['dev', 'QA', 'merge'].map((s, i) => {
        const n = i + 1
        const color = n < r.stage ? 'green' : n === r.stage ? 'yellow' : undefined
        return (
          <Text key={`${r.id}-t${n}`} color={color} dimColor={!color}>
            {s} {bar(n <= r.stage ? trackW : 0, trackW)}{'  '}
          </Text>
        )
      })

    return (
      <Box flexDirection="column">
        {line('title', <Text bold wrap="truncate-end">{view.title}</Text>, view.status)}
        <Text dimColor wrap="truncate-end">
          {view.branches.join(' · ')}
        </Text>
        <Text>
          Merged <Text bold>{view.merged}/{view.slices}</Text>
          {'   '}Blocked <Text bold color={view.blocked ? 'red' : undefined}>{view.blocked}</Text>
          {'   '}Tokens <Text bold>{fmtTokens(view.tokens)}</Text>
          {'   '}Time <Text bold>{fmtTime(view.durationMs)}</Text>
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {blocked.length > 0 && label('h-blocked', `Needs you · ${blocked.length}`)}
          {blocked.map(r => (
            <Box key={`b-${r.id}`} flexDirection="column" marginBottom={1}>
              {line(`b-${r.id}-h`, <Text color="red" bold wrap="truncate-end">✗ {r.id} {r.title}</Text>, `${r.rung ?? ''} · r${r.round}/${r.rungs}`)}
              {indent(`b-${r.id}-why`, r.blocker ?? 'blocked', 'red')}
              {r.defects.slice(0, 3).map((d, i) => indent(`b-${r.id}-d${i}`, `· ${d}`, 'red'))}
              {indent(`b-${r.id}-cmd`, `/orchestrator retry ${r.id} <answer>`, 'red')}
              {detailsButton(r.id)}
              {open === r.id && drillText(`d-${r.id}`, r.id, footerOf(r))}
            </Box>
          ))}
          {going.length > 0 && label('h-going', `In progress · ${going.length}`)}
          {going.map(r => (
            <Box key={`p-${r.id}`} flexDirection="column" marginBottom={1}>
              {line(`p-${r.id}-h`, <Text bold wrap="truncate-end"><Text color="yellow">●</Text> {r.id} {r.title}</Text>, [r.runningMs !== null ? fmtTime(r.runningMs) : '', r.tokens ? fmtTokens(r.tokens) : ''].filter(Boolean).join(' · '))}
              {indent(`p-${r.id}-m`, `${r.mode} · ${r.phase === 'resolving' ? `resolving the conflict ${r.rung ?? ''}`.trim() : r.phase === 'integrating' ? 'merging, then build and suite' : r.phase === 'queued' ? 'queued for merge' : `${r.role ?? ''} ${r.rung ?? ''}`.trim()} · r${r.round}/${r.rungs}`)}
              <Text>
                {'    '}
                {track(r)}
              </Text>
              {detailsButton(r.id)}
              {open === r.id && drillText(`d-${r.id}`, r.id, footerOf(r))}
            </Box>
          ))}
          {next.length > 0 && label('h-next', `Up next · ${next.length}`)}
          {next.map(r =>
            line(`n-${r.id}`, <Text dimColor wrap="truncate-end">{r.phase === 'halted' ? '◌' : '◷'} {r.id} {r.title}</Text>, r.phase === 'halted' ? `held: ${r.blocker ?? 'upstream blocked'}` : r.waitingOn.length ? `after ${r.waitingOn.join(', ')}` : 'ready'),
          )}
          {mergedToggle}
          {!paneUi.isDoneCollapsed &&
            merged.map(r => line(`m-${r.id}`, <Text dimColor wrap="truncate-end"><Text color="green">✓</Text> {r.id} {r.title}</Text>, [r.commit?.slice(0, 7) ?? r.phase, `r${r.round}`].join(' · ')))}
          {label('h-final', 'Final QA')}
          {view.finals.map(f => (
            <Box key={`f-${f.repo}`} flexDirection="column">
              {line(`f-${f.repo}-h`, <Text dimColor={f.phase === 'idle' || f.phase === 'skipped'} color={f.phase === 'pass' ? 'green' : f.phase === 'blocked' ? 'red' : undefined}>{f.phase === 'pass' ? '✓' : f.phase === 'blocked' ? '✗' : f.phase === 'idle' || f.phase === 'skipped' ? '◷' : '●'} {f.repo}</Text>, [f.phase === 'idle' ? 'waits on the slices' : f.phase, f.round ? `remediation r${f.round}` : '', f.findings.length ? `${f.findings.length} findings` : ''].filter(Boolean).join(' · '))}
              {(f.agentId || f.findings.length > 0) && detailsButton(`final:${f.repo}`)}
              {open === `final:${f.repo}` && drillText(`d-final-${f.repo}`, `final:${f.repo}`, [...f.findings.slice(0, 6), ...f.history])}
            </Box>
          ))}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await flushSpawns($)
    const view = await read($, viewAtom)
    const paneUi = await read($, uiAtom)
    if (!view || paneUi.isBandHidden || e.props.hasSurvey) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const c = bandCounts(view)
    const crew = (
      <Button key="orch-open" label={`×${view.agents}`} plain onPress={() => void $.ui.open({ id: PANE, title: 'Orchestrator' })} />
    )
    const dismiss = (
      <Button key="orch-hide" label="✕" plain role="dismiss" onPress={() => update($, uiAtom, prev => ({ ...prev, isBandHidden: true }))} />
    )

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      const width = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 96))
      return (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Svg source={bandSvg(width, view)} alt={`${view.title}: ${bandLabel(view, c)}`} width={width} height={BAND_H} />
          {crew}
          {dismiss}
        </Box>
      )
    }

    const cols = e.props.bodyColumns || 80
    const titleW = Math.max(8, Math.min(30, view.title.length + 2, Math.floor(cols / 3)))
    const width = Math.max(6, Math.min(40, cols - titleW - 34))
    const cells = (n: number) => Math.round((n / Math.max(1, c.slices)) * width)
    const done = cells(c.merged)
    const going = Math.min(width - done, cells(c.going))
    const stuck = Math.min(width - done - going, cells(c.blocked))
    return (
      <Box flexDirection="row" gap={2}>
        <Box width={titleW} flexShrink={0}>
          <Text color={c.blocked ? 'red' : view.status === 'running' ? 'yellow' : 'green'}>● </Text>
          <Text bold wrap="truncate-end">
            {view.title}
          </Text>
        </Box>
        <Text>
          <Text color="green">{'█'.repeat(done)}</Text>
          <Text color="yellow">{'█'.repeat(going)}</Text>
          <Text color="red">{'█'.repeat(stuck)}</Text>
          <Text dimColor>{'░'.repeat(Math.max(0, width - done - going - stuck))}</Text>
        </Text>
        <Text dimColor>{bandLabel(view, c)}</Text>
        {crew}
        {dismiss}
      </Box>
    )
  })
}
