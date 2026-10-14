// A manifest is a markdown file holding one table. Everything around the table
// is kept as written; only the rows are read and rewritten.

export type Table = {
  before: string[]
  header: string[]
  rows: string[][]
  after: string[]
  eol: string
}

const isRow = (line: string) => line.trimStart().startsWith('|')

export const splitRow = (line: string): string[] => {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '\\' && body[i + 1] === '|') {
      cell += '\\|'
      i++
    } else if (c === '|') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += c
    }
  }
  cells.push(cell.trim())
  return cells
}

const joinRow = (cells: readonly string[]) => `| ${cells.map(c => c.replace(/\r?\n/g, ' ')).join(' | ')} |`

export const parseTable = (text: string): Table => {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(isRow)
  if (start < 0) throw new Error('no table found')
  let end = start
  while (end < lines.length && isRow(lines[end]!)) end++
  const header = splitRow(lines[start]!)
  const rows = lines.slice(start + 2, end).map(splitRow)
  return { before: lines.slice(0, start), header, rows, after: lines.slice(end), eol }
}

export const renderTable = (t: Table): string => {
  const lines = [
    ...t.before,
    joinRow(t.header),
    `|${t.header.map(() => '---').join('|')}|`,
    ...t.rows.map(joinRow),
    ...t.after,
  ]
  return lines.join(t.eol)
}

// The cell of a row under a named column, '' when the row is short.
export const cell = (t: Table, row: readonly string[], column: string): string => {
  const i = t.header.indexOf(column)
  return i < 0 ? '' : (row[i] ?? '')
}

export const withCell = (t: Table, row: readonly string[], column: string, value: string): string[] => {
  const i = t.header.indexOf(column)
  if (i < 0) throw new Error(`no column "${column}"`)
  const next = t.header.map((_, k) => row[k] ?? '')
  next[i] = value
  return next
}

// A row built from named values, in the table's own column order.
export const rowOf = (t: Table, values: Record<string, string>): string[] =>
  t.header.map(h => values[h] ?? '')
