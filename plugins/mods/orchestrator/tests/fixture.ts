import { configOf } from '../hooks/config'
import type { Config } from '../hooks/config'
import type { Brief, Plan } from '../hooks/plan'

// The plan and config the tests share: three slices in one repo, 108 waiting on 107.

export const config = (configOf({}) as { isValid: true; config: Config }).config

export const BRIEF: Brief = {
  goal: 'Add the payment DTO.',
  inScope: { files: ['src/Payments/PaymentDto.cs'], symbols: ['PaymentDto'] },
  outOfScope: ['the API controller'],
  acceptance: ['PaymentDto has Amount and Currency', 'the unit tests pass'],
  commands: { build: 'dotnet build', test: 'dotnet test' },
  done: 'the DTO exists with tests, committed',
  returns: 'the report tool with a summary',
}

export function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    title: 'Payments',
    slug: 'payments',
    type: 'feat',
    initials: 'RVR',
    source: { kind: 'github', parent: 'https://github.com/flow-software/timebase/issues/100' },
    repos: { timebase: { root: 'D:/src/flow/timebase', base: 'dev', commands: { build: 'dotnet build', test: 'dotnet test' } } },
    slices: [
      { id: '107', title: 'Core DTO', slug: 'core-dto', repo: 'timebase', deps: [], mode: 'haiku-first', brief: BRIEF },
      { id: '108', title: 'Endpoint', slug: 'endpoint', repo: 'timebase', deps: ['107'], mode: 'sonnet-first' },
      { id: '109', title: 'Docs', slug: 'docs', repo: 'timebase', deps: [], mode: 'sonnet-first' },
    ],
    ...overrides,
  }
}
