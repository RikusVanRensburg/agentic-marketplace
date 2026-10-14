// What the round logs say across runs: how each start mode and each rung does, so the
// pre-flight's choice between haiku-first and sonnet-first rests on data.

export type LogRow = {
  run: string
  at: string
  role: string
  mode: string | null
  round: number
  model: string
  effort: string
  verdict: string
  durationMs: number | null
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number } | null
}

const total = (u: LogRow['usage']) => (u ? u.input + u.output + u.cacheRead + u.cacheWrite : 0)
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-')
const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)))
const secs = (ms: number) => `${Math.round(ms / 1000)}s`

export function parseLog(text: string): LogRow[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line) as LogRow]
      } catch {
        return []
      }
    })
}

type SliceStat = { mode: string; firstQaPass: boolean; roundsToPass: number | null; devOut: number; tokens: number; devMs: number }

function slicesOf(rows: LogRow[]): SliceStat[] {
  const bySlice = new Map<string, LogRow[]>()
  for (const r of rows) {
    if (r.at.startsWith('final:') || !r.mode) continue
    const key = `${r.run}|${r.at}`
    bySlice.set(key, [...(bySlice.get(key) ?? []), r])
  }
  return [...bySlice.values()].map(list => {
    const qas = list.filter(r => r.role === 'qa')
    const passed = qas.find(r => r.verdict === 'pass')
    const devs = list.filter(r => r.role === 'dev')
    return {
      mode: list[0]!.mode as string,
      firstQaPass: qas[0]?.verdict === 'pass' && qas[0]?.round === 1,
      roundsToPass: passed ? passed.round : null,
      devOut: devs.reduce((s, r) => s + (r.usage?.output ?? 0), 0),
      tokens: list.reduce((s, r) => s + total(r.usage), 0),
      devMs: devs.reduce((s, r) => s + (r.durationMs ?? 0), 0),
    }
  })
}

export function statsText(rows: LogRow[]): string {
  if (!rows.length) return 'No orchestrator rounds logged yet.'
  const runs = new Set(rows.map(r => r.run)).size
  const lines = [`${rows.length} rounds over ${runs} run${runs === 1 ? '' : 's'}.`, '', 'By start mode (per slice):']
  for (const mode of ['haiku-first', 'sonnet-first']) {
    const s = slicesOf(rows).filter(x => x.mode === mode)
    if (!s.length) continue
    const passedAt = s.map(x => x.roundsToPass).filter((n): n is number => n !== null)
    lines.push(
      `  ${mode}: ${s.length} slices · QA pass on round 1 ${pct(s.filter(x => x.firstQaPass).length, s.length)} · rounds to pass ${avg(passedAt).toFixed(1)} · dev output ${k(avg(s.map(x => x.devOut)))} · all tokens ${k(avg(s.map(x => x.tokens)))} · dev time ${secs(avg(s.map(x => x.devMs)))}`,
    )
  }
  lines.push('', 'By role and rung (per round):')
  const groups = new Map<string, LogRow[]>()
  for (const r of rows) {
    const key = `${r.role} ${r.model}/${r.effort}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  for (const [key, list] of [...groups.entries()].sort()) {
    lines.push(
      `  ${key}: ${list.length} · pass ${pct(list.filter(r => r.verdict === 'pass').length, list.length)} · output ${k(avg(list.map(r => r.usage?.output ?? 0)))} · tokens ${k(avg(list.map(r => total(r.usage))))} · ${secs(avg(list.map(r => r.durationMs ?? 0)))}`,
    )
  }
  return lines.join('\n')
}
