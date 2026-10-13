import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptOrigin, Register } from 'claude-code'

import type { WorktreeCleanPlan, WorktreeOutcome, WorktreePending, WorktreePr, WorktreePrepared, WorktreeShipPlan } from '../types'
import { hasRef, lifecycleKeys, repoAt, setKey, type Run } from './git'
import { gitCalls, layoutDeny, segmentsOf, stashVerdict, worktreeAddOf } from './guards'
import { PLUGIN, check, create, list, prOf, prepareClean, prepareShip, runClean, runShip, type Ctx } from './lifecycle'
import { join, looksLikeWindows, samePath } from './paths'

const pending = atom({ plugin: 'worktree-lifecycle', key: 'pending' } as const, [])
const busy = atom({ plugin: 'worktree-lifecycle', key: 'busy' } as const, null)

// What the model's tool calls carry, read without trusting their shape.
const str = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)

const HELP = [
  '/wt new <type> <slug> [--base <branch>]   or   /wt new <branch> [--base <branch>]',
  '/wt ship [<branch>] [--base <branch>] [--title <title>] [--ready]',
  '/wt clean <branch>',
  '/wt sweep      offer housekeeping for every merged branch this mod created',
  '/wt check      ask GitHub now whether those PRs merged',
  '/wt status     the branches this mod created in this repo',
].join('\n')

async function ctxOf($: EngineInterface, caller: string): Promise<Ctx> {
  const cwd = await $.session.cwd()
  const run: Run = (argv, options) => $.process.run([...argv], { timeoutMs: 60_000, ...options })

  return {
    run,
    exists: path => $.fs.exists(path),
    complete: async prompt => {
      const answer = await $.model.complete({ model: 'haiku', prompt, maxTokens: 200 })
      return answer.isAnswered ? answer.text : null
    },
    isWindows: looksLikeWindows(cwd),
    caller,
  }
}

// The person's own gesture: Enter at the prompt, the Remote Control bridge, or the
// desktop app's host. A plugin's `$.command.run` and a scheduled prompt are not.
function isPerson(origin: PromptOrigin): boolean {
  return origin.kind === 'composer' || origin.kind === 'bridge' || origin.kind === 'sdk'
}

// What the person and the model are told when a lifecycle step ran or failed.
async function report($: EngineInterface, text: string): Promise<void> {
  $.ui.toast(text)
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: `[${PLUGIN}] ${text}` }] } })
}

async function offer($: EngineInterface, item: Omit<WorktreePending, 'id'>): Promise<WorktreePrepared> {
  const id = `${item.plan.kind}:${item.plan.root}:${item.plan.branch}`
  await update($, pending, queue => [...queue.filter(one => one.id !== id), { ...item, id }])

  return { id, title: item.title }
}

function shipOffer(plan: WorktreeShipPlan, lines: string[]): Omit<WorktreePending, 'id'> {
  const confirm = plan.openPr ? 'Push' : plan.isDraft ? 'Push and open draft PR' : 'Push and open PR'

  return { title: `Ship ${plan.branch}?`, lines, confirm, plan }
}

function cleanOffer(plan: WorktreeCleanPlan, lines: string[], title?: string): Omit<WorktreePending, 'id'> {
  return { title: title ?? `Housekeep ${plan.branch}?`, lines, confirm: 'Housekeep', plan }
}

async function runPlan($: EngineInterface, plan: WorktreeShipPlan | WorktreeCleanPlan): Promise<string> {
  const ctx = await ctxOf($, PLUGIN)
  await update($, busy, () => `${plan.kind === 'ship' ? 'Shipping' : 'Housekeeping'} ${plan.branch}...`)

  try {
    const outcome = plan.kind === 'ship' ? await runShip(ctx, plan) : await runClean(ctx, plan)
    return outcome.isDone ? outcome.text : outcome.reason
  } finally {
    await update($, busy, () => null)
  }
}

// The person pressed the band's button: this is their yes.
async function confirm($: EngineInterface, id: string): Promise<void> {
  let taken: WorktreePending | undefined

  await update($, pending, queue => {
    taken = queue.find(one => one.id === id)
    return queue.filter(one => one.id !== id)
  })

  if (taken !== undefined) {
    await report($, await runPlan($, taken.plan))
  }
}

async function later($: EngineInterface, id: string): Promise<void> {
  await update($, pending, queue => queue.filter(one => one.id !== id))
}

// A merge of a branch this mod created, seen for the first time in any session.
async function announce($: EngineInterface, ctx: Ctx, root: string, pr: WorktreePr): Promise<void> {
  const keys = (await lifecycleKeys(ctx.run, root)).get(pr.branch)

  if (keys?.owner === undefined || keys.isNotified === true) {
    return
  }

  await setKey(ctx.run, root, pr.branch, 'Notified', 'true')
  $.ui.toast(`PR #${pr.number} merged: ${pr.branch}`)
  void $.ui.notify(`PR #${pr.number} merged into ${pr.base}. Housekeep ${pr.branch}?`, { title: PLUGIN })
  await $.worktree.merged({ root, branch: pr.branch, number: pr.number, url: pr.url, base: pr.base })

  const prepared = await prepareClean(ctx, { branch: pr.branch, cwd: root }, root, await $.session.cwd())

  if (prepared.isDone) {
    await offer($, cleanOffer(prepared.plan, prepared.lines, `PR #${pr.number} merged. Housekeep ${pr.branch}?`))
  } else {
    $.ui.toast(`PR #${pr.number} merged, but ${pr.branch} is not ready to housekeep: ${prepared.reason}`)
  }
}

async function checkNow($: EngineInterface, ctx: Ctx, cwd: string): Promise<WorktreeOutcome<{ prs: WorktreePr[] }>> {
  const checked = await check(ctx, cwd)

  if (!checked.isDone) {
    return checked
  }

  for (const pr of checked.prs) {
    if (pr.state === 'MERGED') await announce($, ctx, checked.root, pr)
  }

  return { isDone: true, prs: checked.prs }
}

async function sweep($: EngineInterface, ctx: Ctx, cwd: string): Promise<WorktreeOutcome<{ prepared: WorktreePrepared[]; skipped: string[] }>> {
  const checked = await check(ctx, cwd)

  if (!checked.isDone) {
    return checked
  }

  const prepared: WorktreePrepared[] = []
  const skipped: string[] = []
  const sessionCwd = await $.session.cwd()

  for (const pr of checked.prs.filter(one => one.state === 'MERGED')) {
    const one = await prepareClean(ctx, { branch: pr.branch, cwd: checked.root }, checked.root, sessionCwd)
    if (one.isDone) prepared.push(await offer($, cleanOffer(one.plan, one.lines)))
    else skipped.push(`${pr.branch}: ${one.reason}`)
  }

  return { isDone: true, prepared, skipped }
}

// A GitHub event the session was sent for a pull request; acted on only when it is a merge
// of a branch this mod created in the session's repo.
async function onPullRequest($: EngineInterface, data: Record<string, unknown>): Promise<void> {
  const ref = /^([^#\s]+)#(\d+)$/.exec(String(data.pr ?? ''))

  if (!ref) {
    return
  }

  const ctx = await ctxOf($, PLUGIN)
  const repo = await repoAt(ctx.run, await $.session.cwd())

  if (repo === null || !repo.isBareLayout) {
    return
  }

  const origin = await ctx.run(['gh', 'repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { cwd: repo.root })

  if (origin.stdout.trim().toLowerCase() !== (ref[1] ?? '').toLowerCase()) {
    return
  }

  const viewed = await ctx.run(['gh', 'pr', 'view', ref[2] ?? '', '--json', 'headRefName'], { cwd: repo.root })
  const branch = (JSON.parse(viewed.stdout || '{}') as { headRefName?: string }).headRefName
  const pr = branch ? await prOf(ctx, repo.root, branch) : null

  if (pr?.state === 'MERGED') {
    await announce($, ctx, repo.root, pr)
  }
}

function flagsOf(words: readonly string[]): { positional: string[]; flags: Map<string, string | true> } {
  const positional: string[] = []
  const flags = new Map<string, string | true>()

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? ''

    if (word === '--ready') {
      flags.set('ready', true)
    } else if (word.startsWith('--')) {
      flags.set(word.slice(2), words[i + 1] ?? '')
      i += 1
    } else {
      positional.push(word)
    }
  }

  return { positional, flags }
}

const text = (flag: string | true | undefined) => (typeof flag === 'string' && flag !== '' ? flag : undefined)

async function guardShell($: EngineInterface, command: string): Promise<string | null> {
  if (!/\bgit\b/.test(command)) {
    return null
  }

  const ctx = await ctxOf($, PLUGIN)
  const cwd = await $.session.cwd()

  for (const call of gitCalls(command, cwd, ctx.isWindows)) {
    const sub = call.args[0]

    if (sub !== 'stash' && sub !== 'worktree') {
      continue
    }

    const repo = await repoAt(ctx.run, call.cwd)

    if (repo === null || !repo.isBareLayout) {
      continue
    }

    if (sub === 'stash') {
      const verdict = stashVerdict(call.args.slice(1))
      if (verdict !== null) return verdict
      continue
    }

    const add = worktreeAddOf(call.args)

    if (add === null || add.path === null) {
      continue
    }

    const path = join(call.cwd, add.path, ctx.isWindows)
    let branch = add.newBranch

    if (branch === null && !add.isDetached) {
      if (add.commitish === null) {
        branch = path.slice(path.lastIndexOf('/') + 1)
      } else if (
        (await hasRef(ctx.run, repo.root, `refs/heads/${add.commitish}`)) ||
        (await hasRef(ctx.run, repo.root, `refs/remotes/origin/${add.commitish}`))
      ) {
        branch = add.commitish
      }
    }

    if (branch === null || !samePath(path, `${repo.root}/${branch}`, ctx.isWindows)) {
      return layoutDeny(repo.root, branch)
    }
  }

  return null
}

export const register: Register = on => {
  // Adds `$.worktree` for other mods. A call is the `worktree.<method>` event, which this
  // module's hooks answer with the session's `$`; the methods here are the chain's floor.
  on('engine.create', async ($, e, next) => {
    const built = await next(e)
    const unserved = { isDone: false, reason: 'worktree-lifecycle did not answer.' } as const

    return {
      ...built,
      worktree: {
        create: async () => unserved,
        ship: async () => unserved,
        clean: async () => unserved,
        sweep: async () => unserved,
        check: async () => unserved,
        list: async () => unserved,
        merged: async () => undefined,
      },
    }
  })

  on('worktree.create', async ($, e, next) => ({
    value: await create(await ctxOf($, next.origin.plugin), e, await $.session.cwd()),
  }))

  on('worktree.ship', async ($, e, next) => {
    const prepared = await prepareShip(await ctxOf($, next.origin.plugin), e, await $.session.cwd())
    return { value: prepared.isDone ? { isDone: true, ...(await offer($, shipOffer(prepared.plan, prepared.lines))) } : prepared }
  })

  on('worktree.clean', async ($, e, next) => {
    const cwd = await $.session.cwd()
    const prepared = await prepareClean(await ctxOf($, next.origin.plugin), e, cwd, cwd)
    return { value: prepared.isDone ? { isDone: true, ...(await offer($, cleanOffer(prepared.plan, prepared.lines))) } : prepared }
  })

  on('worktree.sweep', async ($, e, next) => ({
    value: await sweep($, await ctxOf($, next.origin.plugin), e.cwd ?? (await $.session.cwd())),
  }))

  on('worktree.check', async ($, e, next) => ({
    value: await checkNow($, await ctxOf($, next.origin.plugin), e.cwd ?? (await $.session.cwd())),
  }))

  on('worktree.list', async ($, e, next) => ({
    value: await list(await ctxOf($, next.origin.plugin), e.cwd ?? (await $.session.cwd())),
  }))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'wt',
      description: 'Worktree lifecycle: new, ship, clean, sweep, check, status',
      argumentHint: '[new | ship | clean | sweep | check | status]',
    })

    await $.tool.register({
      name: 'worktree_new',
      description:
        'Create a branch and its worktree at <repo>/<branch>, cut from the branch the working directory is on (or base). The name follows the repo\'s branch rule; with none, <type>/<initials>/<slug>. Use instead of git worktree add or EnterWorktree.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['feat', 'fix', 'docs', 'chore', 'refactor', 'test'] },
          slug: { type: 'string', description: 'Lowercase words joined by hyphens' },
          branch: { type: 'string', description: 'A whole branch name, instead of type and slug' },
          base: { type: 'string' },
        },
      },
    })

    await $.tool.register({
      name: 'worktree_ship',
      description:
        'Prepare to push a branch and open its PR (a draft unless isReady). It does not push: the person confirms in the band above the prompt. Tell them it is waiting there.',
      inputSchema: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'Left out, the branch the working directory is on' },
          base: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          isReady: { type: 'boolean', description: 'Open ready for review instead of as a draft; only when the person asked' },
        },
      },
    })

    await $.tool.register({
      name: 'worktree_clean',
      description:
        'Prepare housekeeping for a merged branch: fast-forward its base, remove its worktree, delete the branch with -d, then its remote-tracking ref. It does not run: the person confirms in the band above the prompt.',
      inputSchema: { type: 'object', properties: { branch: { type: 'string' } }, required: ['branch'] },
    })

    await $.tool.register({
      name: 'worktree_sweep',
      description: 'Find every branch this mod created whose PR merged, and offer housekeeping for each in the band above the prompt.',
    })

    await $.tool.register({
      name: 'worktree_check',
      description: 'Ask GitHub now whether the PRs of the branches this mod created have merged. Only when the person asks.',
    })

    await $.tool.register({
      name: 'worktree_status',
      description: 'List the branches this mod created in this repo, their worktrees and bases.',
    })

    return next(e)
  })

  on('command.run', { command: 'wt' }, async ($, e) => {
    const words = segmentsOf(e.args)[0] ?? []
    const [sub = 'status', ...rest] = words
    const { positional, flags } = flagsOf(rest)
    const ctx = await ctxOf($, PLUGIN)
    const cwd = await $.session.cwd()

    if (sub === 'new') {
      const [first, second] = positional
      const args = second === undefined ? { branch: first } : { type: first, slug: second }
      const made = await create(ctx, { ...args, base: text(flags.get('base')) }, cwd)

      return {
        text: made.isDone
          ? `Created ${made.branch} at ${made.path}, cut from ${made.startPoint}. Branch rule: ${made.rule}.`
          : made.reason,
      }
    }

    if (sub === 'ship' || sub === 'clean') {
      const prepared =
        sub === 'ship'
          ? await prepareShip(ctx, { branch: positional[0], base: text(flags.get('base')), title: text(flags.get('title')), isReady: flags.get('ready') === true }, cwd)
          : positional[0] === undefined
            ? ({ isDone: false, reason: 'Name the branch to housekeep: /wt clean <branch>' } as const)
            : await prepareClean(ctx, { branch: positional[0] }, cwd, cwd)

      if (!prepared.isDone) {
        return { text: prepared.reason }
      }

      // Typed by the person, the command is their yes; anyone else's run waits in the band.
      if (isPerson(e.origin)) {
        const done = await runPlan($, prepared.plan)
        return { text: done, context: [`[${PLUGIN}] ${done}`] }
      }

      const item = prepared.plan.kind === 'ship' ? shipOffer(prepared.plan, prepared.lines) : cleanOffer(prepared.plan, prepared.lines)
      const offered = await offer($, item)

      return { text: `${offered.title} Waiting for the person's yes in the band above the prompt.` }
    }

    if (sub === 'sweep') {
      const swept = await sweep($, ctx, cwd)

      if (!swept.isDone) {
        return { text: swept.reason }
      }

      const lines = [
        swept.prepared.length === 0 ? 'Nothing merged is waiting to be housekept.' : `${swept.prepared.length} merged branch${swept.prepared.length === 1 ? '' : 'es'} offered in the band above the prompt.`,
        ...swept.skipped.map(line => `Skipped ${line}`),
      ]

      return { text: lines.join('\n') }
    }

    if (sub === 'check') {
      const checked = await checkNow($, ctx, cwd)

      return {
        text: !checked.isDone
          ? checked.reason
          : checked.prs.length === 0
            ? 'No PRs for the branches this mod created.'
            : checked.prs.map(pr => `#${pr.number} ${pr.state.toLowerCase()}${pr.isDraft ? ' (draft)' : ''}  ${pr.branch} -> ${pr.base}`).join('\n'),
      }
    }

    if (sub === 'status') {
      const listed = await list(ctx, cwd)

      return {
        text: !listed.isDone
          ? listed.reason
          : listed.entries.length === 0
            ? 'No branches created by this mod in this repo.'
            : listed.entries.map(one => `${one.branch}  ${one.path ?? '(no worktree)'}  base ${one.base ?? '?'}${one.owner === PLUGIN ? '' : `  by ${one.owner}`}`).join('\n'),
      }
    }

    return { text: HELP }
  })

  on('tool.call', { tool: 'mcp__worktree-lifecycle__worktree_new' }, async ($, e) => {
    const input = { type: str(e.type), slug: str(e.slug), branch: str(e.branch), base: str(e.base) }
    const made = await create(await ctxOf($, PLUGIN), input, await $.session.cwd())

    return made.isDone
      ? { result: `Created ${made.branch} at ${made.path}, cut from ${made.startPoint}. Branch rule: ${made.rule}. Work there by path; do not cd the session.` }
      : { deny: made.reason }
  })

  on('tool.call', { tool: 'mcp__worktree-lifecycle__worktree_ship' }, async ($, e) => {
    const input = { branch: str(e.branch), base: str(e.base), title: str(e.title), body: str(e.body), isReady: e.isReady === true }
    const prepared = await prepareShip(await ctxOf($, PLUGIN), input, await $.session.cwd())

    if (!prepared.isDone) {
      return { deny: prepared.reason }
    }

    const offered = await offer($, shipOffer(prepared.plan, prepared.lines))

    return { result: `${offered.title} ${prepared.lines.join('. ')}. Nothing is pushed until the person presses the button in the band above the prompt.` }
  })

  on('tool.call', { tool: 'mcp__worktree-lifecycle__worktree_clean' }, async ($, e) => {
    const branch = str(e.branch)
    const cwd = await $.session.cwd()

    if (branch === undefined) {
      return { deny: 'Name the branch to housekeep.' }
    }

    const prepared = await prepareClean(await ctxOf($, PLUGIN), { branch }, cwd, cwd)

    if (!prepared.isDone) {
      return { deny: prepared.reason }
    }

    const offered = await offer($, cleanOffer(prepared.plan, prepared.lines))

    return { result: `${offered.title} ${prepared.lines.join('. ')}. Nothing runs until the person presses the button in the band above the prompt.` }
  })

  on('tool.call', { tool: 'mcp__worktree-lifecycle__worktree_sweep' }, async $ => {
    const swept = await sweep($, await ctxOf($, PLUGIN), await $.session.cwd())

    return swept.isDone
      ? { result: `${swept.prepared.length} merged branch(es) offered for housekeeping in the band.${swept.skipped.map(line => ` Skipped ${line}.`).join('')}` }
      : { deny: swept.reason }
  })

  on('tool.call', { tool: 'mcp__worktree-lifecycle__worktree_check' }, async $ => {
    const checked = await checkNow($, await ctxOf($, PLUGIN), await $.session.cwd())

    return checked.isDone ? { result: JSON.stringify(checked.prs) } : { deny: checked.reason }
  })

  on('tool.call', { tool: 'mcp__worktree-lifecycle__worktree_status' }, async $ => {
    const listed = await list(await ctxOf($, PLUGIN), await $.session.cwd())

    return listed.isDone ? { result: JSON.stringify(listed.entries) } : { deny: listed.reason }
  })

  // GitHub events for the session's subscribed PRs: the merge notice without polling.
  on('session.receive', ($, e, next) => {
    const event = e.event

    if (event?.source === 'github' && event.kind.startsWith('pull_request')) {
      const data = event.data
      $.clock.after(0, () => void onPullRequest($, data).catch(error => $.ui.log(String(error), { to: 'debug' })))
    }

    return next(e)
  })

  // Guards. Each refuses in its own words, and refuses too if it fails.
  on('tool.call', { tool: 'EnterWorktree' }, () => ({
    deny: `${PLUGIN}: EnterWorktree puts worktrees under .claude/worktrees/, which breaks the <repo>/<branch> layout. Use the worktree_new tool.`,
  })).catch(($, e, next) => (next.called ? next(e) : { deny: `${PLUGIN}: EnterWorktree is not used here.` }))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const verdict = await guardShell($, e.command)
    return verdict === null ? next(e) : { deny: `${PLUGIN}: ${verdict}` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${PLUGIN}: its git guard failed on this command.` }))

  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    const verdict = await guardShell($, e.command)
    return verdict === null ? next(e) : { deny: `${PLUGIN}: ${verdict}` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${PLUGIN}: its git guard failed on this command.` }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const queue = await read($, pending)
    const working = await read($, busy)
    const item = queue[0]

    if (e.props.hasSurvey || (item === undefined && working === null)) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)

    if (working !== null || item === undefined) {
      return (
        <Box>
          <Text dimColor>{working}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text bold>
          {item.title}
          {queue.length > 1 ? `  (1 of ${queue.length})` : ''}
        </Text>
        {item.lines.map(line => (
          <Text dimColor>  {line}</Text>
        ))}
        <Box>
          <Button key="confirm" variant="primary" label={item.confirm} onPress={() => confirm($, item.id)} />
          <Text> </Text>
          <Button key="later" label="Later" onPress={() => later($, item.id)} />
        </Box>
      </Box>
    )
  })
}
