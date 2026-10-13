// What the mod's own agents may not do, whatever the permission mode or the person's allow
// rules say. Pushing, the tracker, branches and worktrees are the mod's alone, and an agent
// stays inside its own worktree. A shell check reads command text, so it is a net, not a wall:
// it catches the plain spellings an agent reaches for.

const RESERVED: readonly [RegExp, string][] = [
  [/\bgit\b[^;&|\n]*\bpush\b/, 'pushing is the orchestrator\'s, after the person says yes'],
  [/\bgh\s+issue\s+(close|reopen|create|edit|comment|delete|transfer|pin|unpin|lock|unlock|develop)\b/, 'the tracker is the orchestrator\'s'],
  [/\bgh\s+pr\s+(create|merge|close|reopen|edit|comment|review|ready|checkout|lock|unlock)\b/, 'pull requests are the orchestrator\'s'],
  [/\bgh\s+api\b[^;&|\n]*(\s-X\s*(?!GET\b)|\s--method[=\s]+(?!GET\b)|\s-[fF]\s|\s--(raw-)?field\b|\s--input\b)/, 'writing through the GitHub API is the orchestrator\'s'],
  [/\bgh\s+(release|repo|label|project|workflow|secret|variable|ruleset)\s+(?!view\b|list\b)/, 'GitHub settings and releases are the orchestrator\'s'],
  [/\bgit\b[^;&|\n]*\bbranch\s+(-d|-D|--delete|-m|-M|--move)\b/, 'deleting or renaming branches is the orchestrator\'s'],
  [/\bgit\b[^;&|\n]*\bworktree\s+(add|remove|move|prune)\b/, 'worktrees are the orchestrator\'s'],
  [/\bgit\b[^;&|\n]*\b(checkout|switch)\b(?![^;&|\n]*--\s)/, 'stay on the branch you were given'],
  [/\bgit\b[^;&|\n]*\bstash\b/, 'the stash stack is shared with other sessions'],
  [/\bgit\b[^;&|\n]*\breset\s+--hard\s+(?!HEAD\b)/, 'reset only to HEAD; history is the orchestrator\'s'],
  [/\bgit\b[^;&|\n]*\brebase\b/, 'history is the orchestrator\'s'],
]

const slashed = (path: string) => path.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/').replace(/\/+$/, '')

const isAbsolute = (path: string) => /^([a-zA-Z]:)?\//.test(slashed(path))

export function isInside(path: string, folder: string): boolean {
  const inner = slashed(path).toLowerCase()
  const outer = slashed(folder).toLowerCase()
  return inner === outer || inner.startsWith(`${outer}/`)
}

// Absolute paths a command moves into or points git at.
function targetsOf(command: string): string[] {
  const found: string[] = []
  const patterns = [/\b(?:cd|pushd|Set-Location|sl)\s+("[^"]+"|'[^']+'|\S+)/gi, /\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/g]
  for (const pattern of patterns) {
    for (const match of command.matchAll(pattern)) {
      const target = match[1]
      if (target && isAbsolute(target)) found.push(slashed(target))
    }
  }
  return found
}

export function shellDeny(command: string, worktree: string): string | null {
  for (const [pattern, why] of RESERVED) {
    if (pattern.test(command)) return why
  }

  const outside = targetsOf(command).find(target => !isInside(target, worktree))
  return outside ? `${outside} is outside your worktree ${worktree}` : null
}

const SHELLS = new Set(['Bash', 'PowerShell'])
const WRITERS = new Set(['Edit', 'Write', 'NotebookEdit'])

// The refusal for one tool call of one of the mod's agents, or null to let it through.
export function denyOf(tool: string, input: Record<string, unknown>, worktree: string): string | null {
  if (SHELLS.has(tool) && typeof input.command === 'string') {
    return shellDeny(input.command, worktree)
  }

  if (WRITERS.has(tool)) {
    const path = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
    if (path && isAbsolute(path) && !isInside(path, worktree)) return `${slashed(path)} is outside your worktree ${worktree}`
  }

  return null
}
