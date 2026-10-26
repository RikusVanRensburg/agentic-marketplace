// The mod's settings, read from `userConfig` and frozen into each run when it launches, so a
// change in /config never alters a run already going.

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type Rung = { model: string; effort: Effort }

export type Mode = 'sonnet-first' | 'haiku-first'

export const MODES: readonly Mode[] = ['sonnet-first', 'haiku-first']

export type Config = {
  ladders: Record<Mode, Rung[]>
  qa: Rung
  finalQa: Rung
  // Final-QA remediation climbs this ladder; it is the sonnet-first one.
  remediation: Rung[]
  // The merge agent climbs this ladder when it fails to do or report its work.
  merge: Rung[]
  takeover: 'continue' | 'fresh'
  concurrency: number
}

const EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const DEFAULTS = {
  sonnetFirst: 'sonnet/high, sonnet/xhigh, opus/high',
  haikuFirst: 'haiku/high, sonnet/high, opus/high',
  qa: 'opus/high',
  finalQa: 'opus/xhigh',
  merge: 'sonnet/medium, sonnet/high, opus/high',
  takeover: 'continue',
  concurrency: 3,
} as const

export type ConfigResult = { isValid: true; config: Config } | { isValid: false; errors: string[] }

// `model/effort`, the model an alias or a full id. Effort left out means high.
export function parseRung(text: string): Rung | string {
  const [model = '', effort = 'high', extra] = text.trim().split('/').map(part => part.trim())

  if (!/^[A-Za-z0-9._-]+$/.test(model)) {
    return `"${text.trim()}" does not name a model`
  }

  if (extra !== undefined || !EFFORTS.includes(effort)) {
    return `"${text.trim()}" needs model/effort, effort one of ${EFFORTS.join(', ')}`
  }

  return { model, effort: effort as Effort }
}

export function parseLadder(text: string): Rung[] | string {
  const parts = text.split(',').map(part => part.trim()).filter(Boolean)

  if (!parts.length) {
    return 'a ladder needs at least one rung'
  }

  const rungs: Rung[] = []

  for (const part of parts) {
    const rung = parseRung(part)

    if (typeof rung === 'string') {
      return rung
    }

    rungs.push(rung)
  }

  return rungs
}

const str = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value : fallback)

export function configOf(options: Record<string, unknown>): ConfigResult {
  const errors: string[] = []
  const ladder = (key: 'sonnetFirst' | 'haikuFirst' | 'merge') => {
    const parsed = parseLadder(str(options[key], DEFAULTS[key]))

    if (typeof parsed === 'string') {
      errors.push(`${key}: ${parsed}`)
      return []
    }

    return parsed
  }
  const rung = (key: 'qa' | 'finalQa') => {
    const parsed = parseRung(str(options[key], DEFAULTS[key]))

    if (typeof parsed === 'string') {
      errors.push(`${key}: ${parsed}`)
      return { model: 'opus', effort: 'high' as const }
    }

    return parsed
  }

  const sonnetFirst = ladder('sonnetFirst')
  const haikuFirst = ladder('haikuFirst')
  const merge = ladder('merge')
  const takeover = str(options.takeover, DEFAULTS.takeover)
  const concurrency = typeof options.concurrency === 'number' ? options.concurrency : DEFAULTS.concurrency

  if (takeover !== 'continue' && takeover !== 'fresh') {
    errors.push(`takeover: "${takeover}" is not continue or fresh`)
  }

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    errors.push(`concurrency: ${concurrency} is not a whole number of at least 1`)
  }

  const config: Config = {
    ladders: { 'sonnet-first': sonnetFirst, 'haiku-first': haikuFirst },
    qa: rung('qa'),
    finalQa: rung('finalQa'),
    remediation: sonnetFirst,
    merge,
    takeover: takeover === 'fresh' ? 'fresh' : 'continue',
    concurrency,
  }

  return errors.length ? { isValid: false, errors } : { isValid: true, config }
}

export const rungLabel = (rung: Rung) => `${rung.model}/${rung.effort}`
