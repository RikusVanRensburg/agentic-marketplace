// The desktop drawing of the pane, in the savvy-progress style: each block one SVG (the
// desktop wraps sibling elements, so a row's parts live in one drawing), light and dark by
// CSS class, text cut to fit. Pure strings, so the layout is testable.

import type { Activity, FinalRow, RunView, SliceRow } from '../types'
import { fmtTime, fmtTokens } from './view'

export const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"
const MONO = "ui-monospace,'Cascadia Mono',Consolas,monospace"

export const COLOR = { run: '#EF9F27', done: '#639922', danger: '#E24B4A', idle: '#9a9a96' } as const

const CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#ecebe8}.ln{stroke:#e4e4e1}.tile{fill:#f4f3f0}.dt{fill:#a32d2d}.db{fill:#fcebeb}.dl{stroke:#f09595}.pill{fill:#faeeda}.pt{fill:#854f0b}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#2c2c2b}.ln{stroke:#333331}.tile{fill:#262625}.dt{fill:#f7c1c1}.db{fill:#3a1c1c}.dl{stroke:#791f1f}.pill{fill:#4a3208}.pt{fill:#fac775}}
.live{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
</style>`

export const xml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const charEm = (ch: string) => (/[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-Z@%mw]/.test(ch) ? 0.72 : 0.56)

export const textWidth = (s: string, size: number) => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

export function fit(s: string, size: number, maxW: number): string {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(`${out}${ch}…`, size) > maxW) break
    out += ch
  }
  return `${out}…`
}

// Words into lines no wider than `maxW`, at most `max` lines.
export function wrap(s: string, size: number, maxW: number, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of s.replace(/\s+/g, ' ').trim().split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (textWidth(next, size) <= maxW || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.length > max ? [...lines.slice(0, max - 1), fit(lines.slice(max - 1).join(' '), size, maxW)] : lines
}

const svg = (W: number, H: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${CSS}${body}</svg>`

const text = (x: number, y: number, size: number, cls: string, s: string, extra = '') =>
  `<text class="${cls}" x="${x}" y="${y}" font-family="${FONT}" font-size="${size}"${extra}>${xml(s)}</text>`

const right = (x: number, y: number, size: number, cls: string, s: string) => text(x, y, size, cls, s, ' text-anchor="end" font-variant-numeric="tabular-nums"')

// --- the header: name, status, branch, four tiles

export const HEADER_H = 88

export function headerSvg(W: number, view: RunView): string {
  const pill = view.status
  const pillW = textWidth(pill, 11) + 16
  const tiles: [string, string, string?][] = [
    ['Merged', `${view.merged} / ${view.slices}`],
    ['Blocked', String(view.blocked), view.blocked ? 'dt' : undefined],
    ['Tokens', fmtTokens(view.tokens)],
    ['Time', fmtTime(view.durationMs)],
  ]
  const gap = 6
  const tw = (W - gap * 3) / 4
  const tileSvg = tiles
    .map(([k, v, cls], i) => {
      const x = i * (tw + gap)
      return `<rect class="tile" x="${x}" y="44" width="${tw}" height="40" rx="8"/>${text(x + 9, 60, 11, 's', k)}${text(x + 9, 77, 15, cls ?? 't', v, ' font-weight="600" font-variant-numeric="tabular-nums"')}`
    })
    .join('')
  return svg(
    W,
    HEADER_H,
    `${text(0, 16, 15, 't', fit(view.title, 15, W - pillW - 12), ' font-weight="600"')}
<rect class="pill" x="${W - pillW}" y="3" width="${pillW}" height="18" rx="6"/>${text(W - pillW / 2, 16, 11, 'pt', pill, ' text-anchor="middle"')}
${text(0, 34, 12, 's', fit(view.branches.join(' · '), 12, W))}
${tileSvg}`,
  )
}

// --- a blocker card: reason, rung, open defects, how to answer

export function blockerSvg(W: number, row: SliceRow): { svg: string; height: number } {
  const inner = W - 20
  const reason = wrap(row.blocker ?? 'blocked', 12, inner, 2)
  const defects = row.defects.slice(0, 3).map(d => fit(`· ${d}`, 12, inner))
  const lines = [...reason.map(l => ({ s: l, size: 12, mono: false })), ...defects.map(l => ({ s: l, size: 12, mono: false })), { s: `/orchestrator retry ${row.id} <answer>`, size: 11, mono: true }]
  const height = 30 + lines.length * 16
  const body = lines
    .map((l, i) => `<text class="dt" x="10" y="${38 + i * 16}" font-family="${l.mono ? MONO : FONT}" font-size="${l.size}">${xml(l.s)}</text>`)
    .join('')
  return {
    height,
    svg: svg(
      W,
      height,
      `<rect class="db" x="0.5" y="0.5" width="${W - 1}" height="${height - 1}" rx="8"/><rect class="dl" x="0.5" y="0.5" width="${W - 1}" height="${height - 1}" rx="8" fill="none"/>
${text(10, 20, 13, 'dt', fit(`✗ ${row.id} ${row.title}`, 13, W * 0.62), ' font-weight="600"')}${right(W - 10, 20, 12, 'dt', `${row.rung ?? ''} · r${row.round}/${row.rungs}`)}
${body}`,
    ),
  }
}

// --- an in-progress slice: name, what runs where, the dev, QA, merge track

export const PROGRESS_H = 64

const STAGES = ['dev', 'QA', 'merge'] as const

export function progressSvg(W: number, row: SliceRow): string {
  const stats = [row.runningMs !== null ? fmtTime(row.runningMs) : '', row.tokens ? fmtTokens(row.tokens) : ''].filter(Boolean).join(' · ')
  const what = row.phase === 'integrating' ? 'merging, then build and suite' : row.phase === 'queued' ? 'queued for merge' : row.phase === 'starting' ? 'creating its worktree' : `${row.role ?? ''} ${row.rung ?? ''}`.trim()
  const meta = `${row.mode} · ${what} · r${row.round}/${row.rungs}`
  const gap = 4
  const sw = (W - 14 - gap * 2) / 3
  // stage: 1 dev, 2 QA, 3 merge; earlier stages are done, the current one runs.
  const track = STAGES.map((label, i) => {
    const x = 14 + i * (sw + gap)
    const n = i + 1
    const fill = n < row.stage ? COLOR.done : n === row.stage ? COLOR.run : null
    return `<rect class="k" x="${x}" y="44" width="${sw}" height="4" rx="2"/>${fill ? `<rect${n === row.stage ? ' class="live"' : ''} x="${x}" y="44" width="${sw}" height="4" rx="2" fill="${fill}"/>` : ''}${text(x, 60, 11, 'm', label)}`
  }).join('')
  return svg(
    W,
    PROGRESS_H,
    `<circle class="live" cx="4" cy="12" r="3.5" fill="${COLOR.run}"/>
${text(14, 16, 13, 't', fit(`${row.id} ${row.title}`, 13, W - 14 - textWidth(stats, 12) - 16), ' font-weight="600"')}${right(W, 16, 12, 's', stats)}
${text(14, 33, 12, 's', fit(meta, 12, W - 14))}
${track}
<line class="ln" x1="0" y1="${PROGRESS_H - 0.5}" x2="${W}" y2="${PROGRESS_H - 0.5}"/>`,
  )
}

// --- one-line rows: up next, merged, final QA

export const LINE_H = 26

export function lineSvg(W: number, glyph: string, color: string, left: string, rightText: string, isDim = true): string {
  const rw = textWidth(rightText, 12)
  return svg(
    W,
    LINE_H,
    `${text(0, 17, 12, 's', glyph, ` fill="${color}"`).replace('class="s" ', '')}
${text(16, 17, 13, isDim ? 's' : 't', fit(left, 13, W - 16 - rw - 12))}${right(W, 17, 12, 'm', rightText)}
<line class="ln" x1="0" y1="${LINE_H - 0.5}" x2="${W}" y2="${LINE_H - 0.5}"/>`,
  )
}

export const waitingLine = (W: number, r: SliceRow) =>
  lineSvg(W, r.phase === 'halted' ? '◌' : '◷', COLOR.idle, `${r.id} ${r.title}`, r.phase === 'halted' ? `held: ${r.blocker ?? 'upstream blocked'}` : r.waitingOn.length ? `after ${r.waitingOn.join(', ')}` : 'ready')

export const mergedLine = (W: number, r: SliceRow) =>
  lineSvg(W, '✓', COLOR.done, `${r.id} ${r.title}`, [r.commit?.slice(0, 7) ?? r.phase, `r${r.round}`, r.tokens ? fmtTokens(r.tokens) : ''].filter(Boolean).join(' · '))

export function finalLine(W: number, f: FinalRow): string {
  const glyph = f.phase === 'pass' ? '✓' : f.phase === 'blocked' ? '✗' : f.phase === 'judging' || f.phase === 'fixing' ? '●' : '◷'
  const color = f.phase === 'pass' ? COLOR.done : f.phase === 'blocked' ? COLOR.danger : f.phase === 'judging' || f.phase === 'fixing' ? COLOR.run : COLOR.idle
  const state = [f.phase === 'idle' ? 'waits on the slices' : f.phase, f.round ? `remediation r${f.round}` : '', f.findings.length ? `${f.findings.length} findings` : ''].filter(Boolean).join(' · ')
  return lineSvg(W, glyph, color, f.repo, state, f.phase === 'idle' || f.phase === 'skipped')
}

// --- the drill-in: what the agent is doing now

export function activitySvg(W: number, activity: Activity | undefined, latest: string, footer: string[]): { svg: string; height: number } {
  const now = Date.now()
  const lines: { s: string; cls: string; mono: boolean }[] = []
  if (activity) {
    lines.push({ s: activity.task, cls: 's', mono: true })
    for (const a of activity.lines.slice(-8)) lines.push({ s: `${fmtTime(Math.max(0, now - a.at)).padStart(4)}  ${a.text}`, cls: 't', mono: true })
  }
  if (latest) {
    lines.push({ s: 'Latest message', cls: 'm', mono: false })
    for (const l of wrap(latest, 12, W - 20, 3)) lines.push({ s: l, cls: 's', mono: false })
  }
  for (const f of footer) lines.push({ s: f, cls: 'm', mono: true })
  const height = 12 + lines.length * 16
  const body = lines
    .map((l, i) => `<text class="${l.cls}" x="10" y="${20 + i * 16}" font-family="${l.mono ? MONO : FONT}" font-size="${l.mono ? 11 : 12}"${l.mono ? ' xml:space="preserve"' : ''}>${xml(fit(l.s, l.mono ? 11 : 12, W - 20))}</text>`)
    .join('')
  return { height, svg: svg(W, height, `<rect class="tile" x="0" y="0" width="${W}" height="${height}" rx="8"/>${body}`) }
}

// --- the band above the prompt: one row, like savvy's progress bar

export const BAND_H = 22

export type BandCounts = { merged: number; going: number; blocked: number; slices: number }

export const bandCounts = (view: RunView): BandCounts => ({
  merged: view.merged,
  going: view.rows.filter(r => r.group === 'build' || r.group === 'integrate').length,
  blocked: view.rows.filter(r => r.group === 'blocked').length,
  slices: view.slices,
})

export const bandLabel = (view: RunView, c: BandCounts) =>
  [`${c.merged}/${c.slices} merged`, c.blocked ? `${c.blocked} blocked` : '', view.status === 'running' ? '' : view.status].filter(Boolean).join(' · ')

export function bandSvg(W: number, view: RunView): string {
  const c = bandCounts(view)
  const dot = c.blocked ? COLOR.danger : view.status === 'running' ? COLOR.run : COLOR.done
  const label = bandLabel(view, c)
  const titleW = Math.min(200, Math.max(60, W * 0.28))
  const title = fit(view.title, 12, titleW)
  const labelW = textWidth(label, 12)
  const x0 = 14 + textWidth(title, 12) + 10
  const barW = Math.max(40, W - x0 - labelW - 12)
  const unit = barW / Math.max(1, c.slices)
  const seg = (from: number, n: number, color: string, isLive = false) =>
    n > 0 ? `<rect${isLive ? ' class="live"' : ''} x="${x0 + from * unit}" y="7" width="${Math.max(2, n * unit - (from + n < c.slices ? 1 : 0))}" height="8" fill="${color}"/>` : ''
  return svg(
    W,
    BAND_H,
    `<circle${view.status === 'running' ? ' class="live"' : ''} cx="5" cy="11" r="3.5" fill="${dot}"/>
${text(14, 15, 12, 't', title, ' font-weight="600"')}
<defs><clipPath id="bar"><rect x="${x0}" y="7" width="${barW}" height="8" rx="4"/></clipPath></defs>
<rect class="k" x="${x0}" y="7" width="${barW}" height="8" rx="4"/>
<g clip-path="url(#bar)">${seg(0, c.merged, COLOR.done)}${seg(c.merged, c.going, COLOR.run, true)}${seg(c.merged + c.going, c.blocked, COLOR.danger)}</g>
${right(W, 15, 12, 's', label)}`,
  )
}
