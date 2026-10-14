// /issues: the person's side of the mod. It carries out a consolidation the model planned,
// and only when the person typed the command.

import type { PromptOrigin } from 'claude-code'

import { type Io, repoOf } from './gh'
import { applyConsolidate, pendingPlan, PLAN_KEY } from './ops'

const USAGE = [
  'Usage: /issues <action>',
  '  (none)                 show the planned consolidation, if any',
  '  consolidate            carry out the planned consolidation',
  '  consolidate cancel     drop the plan',
].join('\n')

// The person's own gesture: Enter at the prompt, the Remote Control bridge, or the
// desktop app's host. A plugin's `$.command.run` and a scheduled prompt are not.
export const isPerson = (origin: PromptOrigin) => origin.kind === 'composer' || origin.kind === 'bridge' || origin.kind === 'sdk'

export const route = async (io: Io, args: string, origin: PromptOrigin): Promise<string> => {
  const t = args.trim().split(/\s+/).filter(Boolean)
  const plan = await pendingPlan(io)
  if (!t.length) return plan ? `Planned in ${plan.repo}: keep #${plan.survivor}, close #${plan.loser}. /issues consolidate carries it out.` : `Nothing planned.\n${USAGE}`
  if (t[0] !== 'consolidate') return USAGE
  if (t[1] === 'cancel') {
    await io.storeDelete(PLAN_KEY)
    return plan ? `Dropped the plan to close #${plan.loser}.` : 'Nothing planned.'
  }
  if (!plan) return 'Nothing planned, or the plan is over an hour old. Plan it again with the issue_consolidate tool.'
  if (!isPerson(origin)) throw new Error('/issues consolidate closes an issue, so only the person typing it carries it out.')
  return applyConsolidate(io, await repoOf(io, plan.repo), plan)
}

