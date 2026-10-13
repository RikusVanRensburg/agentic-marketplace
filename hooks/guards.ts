// Reading the git calls out of a Bash or PowerShell command. Best effort: it follows quotes,
// `&&`, `;`, pipes, `cd` and `git -C`, which is how these commands are written in practice.

import { join } from './paths'

export type GitCall = { cwd: string; args: string[] }

export type WorktreeAdd = { path: string | null; newBranch: string | null; commitish: string | null; isDetached: boolean }

const CD = new Set(['cd', 'chdir', 'pushd', 'set-location', 'sl'])

// Splits at `;`, `&`, `|` and line breaks outside quotes, then into words.
export function segmentsOf(command: string): string[][] {
  const segments: string[][] = []
  let words: string[] = []
  let word = ''
  let hasWord = false
  let quote: string | null = null

  const endWord = () => {
    if (hasWord) words.push(word)
    word = ''
    hasWord = false
  }

  const endSegment = () => {
    endWord()
    if (words.length > 0) segments.push(words)
    words = []
  }

  for (let i = 0; i < command.length; i += 1) {
    const char = command.charAt(i)

    if (quote !== null) {
      if (char === quote) quote = null
      else word += char
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      hasWord = true
    } else if (char === ';' || char === '&' || char === '|' || char === '\n' || char === '\r') {
      endSegment()
    } else if (char === ' ' || char === '\t') {
      endWord()
    } else {
      word += char
      hasWord = true
    }
  }

  endSegment()

  return segments
}

export function gitCalls(command: string, cwd: string, isWindows: boolean): GitCall[] {
  const calls: GitCall[] = []
  let here = cwd

  for (const words of segmentsOf(command)) {
    const first = (words[0] ?? '').toLowerCase()

    if (CD.has(first)) {
      const target = words.slice(1).find(word => !word.startsWith('-'))
      if (target !== undefined && target !== '~') here = join(here, target, isWindows)
      continue
    }

    if (!/(^|[\\/])git(\.exe)?$/i.test(first)) {
      continue
    }

    let at = here
    let i = 1

    for (; i < words.length; i += 1) {
      const word = words[i] ?? ''

      if (word === '-C') {
        at = join(at, words[i + 1] ?? '.', isWindows)
        i += 1
      } else if (word === '-c') {
        i += 1
      } else if (!word.startsWith('-')) {
        break
      }
    }

    calls.push({ cwd: at, args: words.slice(i) })
  }

  return calls
}

function hasMessage(args: readonly string[]): boolean {
  return args.some(arg => arg === '-m' || arg === '--message' || arg.startsWith('--message=') || /^-m./.test(arg))
}

// The stash stack is shared by every worktree and session.
export function stashVerdict(args: readonly string[]): string | null {
  const sub = args[0]
  const isPush = sub === undefined || sub === 'push' || sub.startsWith('-')

  if (sub === 'pop') {
    return 'git stash pop takes the top entry, which may be another session\'s: the stash stack is shared across worktrees. Find your entry with `git stash list --format=\'%H %gs\'` and run `git stash apply <sha>`.'
  }

  if (sub === 'save' || (isPush && !hasMessage(args))) {
    return 'An untagged stash cannot be told apart from another session\'s: the stash stack is shared across worktrees. Prefer a WIP commit, or run `git stash push -u -m "<unique-tag>"`.'
  }

  return null
}

export function worktreeAddOf(args: readonly string[]): WorktreeAdd | null {
  if (args[0] !== 'worktree' || args[1] !== 'add') {
    return null
  }

  const positional: string[] = []
  let newBranch: string | null = null
  let isDetached = false

  for (let i = 2; i < args.length; i += 1) {
    const arg = args[i] ?? ''

    if (arg === '-b' || arg === '-B') {
      newBranch = args[i + 1] ?? null
      i += 1
    } else if (arg === '--reason') {
      i += 1
    } else if (arg === '--detach' || arg === '-d') {
      isDetached = true
    } else if (arg === '--') {
      positional.push(...args.slice(i + 1))
      break
    } else if (!arg.startsWith('-')) {
      positional.push(arg)
    }
  }

  return { path: positional[0] ?? null, newBranch, commitish: positional[1] ?? null, isDetached }
}

export function layoutDeny(root: string, branch: string | null): string {
  return branch === null
    ? `A worktree here is a folder named for its branch, so it needs a branch: git -C "${root}" worktree add "${root}/<branch>" -b <branch> <base>.`
    : `A worktree's path is <repo>/<branch>, verbatim. Use: git -C "${root}" worktree add "${root}/${branch}" ...`
}
