// Branch names: the repo's own rule wins, then the fallback `<type>/<initials>/<description>`.

export const TYPES = ['feat', 'fix', 'docs', 'chore', 'refactor', 'test'] as const

export type BranchRule = { pattern: string; source: string }

export const FALLBACK_RULE: BranchRule = {
  pattern: '^(feat|fix|docs|chore|refactor|test)/[A-Za-z]{2,4}/[a-z0-9][a-z0-9-]*$',
  source: 'the fallback <type>/<initials>/<description>',
}

// The files that may describe a naming rule in prose, read in this order.
export const PROSE_FILES = ['CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/CONTRIBUTING.md', 'CLAUDE.md', 'docs/agents/branches.md']

// Regexes a CI workflow checks branch names against: a quoted string opening with `^`,
// in a workflow that talks about branches at all.
export function patternsInWorkflow(text: string): string[] {
  if (!/head_ref|branch/i.test(text)) {
    return []
  }

  const found: string[] = []

  for (const match of text.matchAll(/(['"])(\^[^'"\n]+)\1/g)) {
    const pattern = match[2] ?? ''

    if (compiles(pattern)) {
      found.push(pattern)
    }
  }

  return found
}

export function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

export function mentionsBranchNaming(text: string): boolean {
  return /branch(es)?\s+(name|naming|prefix|pattern)|naming\s+(rule|convention)s?\s+for\s+branch/i.test(text)
}

export function namingPrompt(files: readonly { path: string; text: string }[]): string {
  const bodies = files.map(file => `<file path="${file.path}">\n${file.text.slice(0, 12_000)}\n</file>`).join('\n\n')

  return [
    'Below are files from a git repository. If they state a rule for how git branch names must look,',
    'answer with exactly one line: a JavaScript regular expression, without slashes or flags, that a valid',
    'branch name matches, anchored with ^ and $. If they state no such rule, answer exactly NONE.',
    '',
    bodies,
  ].join('\n')
}

export function ruleFromAnswer(answer: string | null): string | null {
  const line = (answer ?? '').trim().split('\n')[0]?.trim().replace(/^`+|`+$/g, '').replace(/^\/(.*)\/[a-z]*$/, '$1') ?? ''

  return line === '' || line.toUpperCase() === 'NONE' || !compiles(line) ? null : line
}

export function initialsOf(name: string): string | null {
  const initials = name
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0))
    .filter(letter => /[A-Za-z]/.test(letter))
    .join('')
    .toUpperCase()

  return initials.length >= 2 && initials.length <= 4 ? initials : null
}

export function isSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
}

export function isType(type: string): type is (typeof TYPES)[number] {
  return (TYPES as readonly string[]).includes(type)
}

// `<type>/<INITIALS>/orchestration/...` belongs to the orchestrator.
export function isReserved(branch: string): boolean {
  return /^[^/]+\/[^/]+\/orchestration(\/|$)/i.test(branch)
}

// Git cannot hold `a/b` beside `a/b/c`: one is a file under refs, the other a folder.
export function clashOf(branch: string, refs: readonly string[]): string | null {
  for (const ref of refs) {
    if (ref === branch || ref.startsWith(`${branch}/`) || branch.startsWith(`${ref}/`)) {
      return ref
    }
  }

  return null
}
