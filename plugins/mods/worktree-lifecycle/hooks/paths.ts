// Paths as git, Git Bash and PowerShell spell them, made comparable. On Windows `/d/src`,
// `D:\src` and `d:/src/` are one folder.

export function normalize(path: string, isWindows: boolean): string {
  let text = path.trim().replace(/\\/g, '/')
  const posixDrive = isWindows ? /^\/([a-zA-Z])(?=\/|$)/.exec(text) : null

  if (posixDrive) {
    text = `${posixDrive[1]}:${text.slice(2) || '/'}`
  }

  const drive = /^[a-zA-Z]:/.exec(text)
  const head = drive ? `${drive[0].toUpperCase()}/` : text.startsWith('/') ? '/' : ''
  const parts: string[] = []

  for (const part of text.slice(drive ? 2 : 0).split('/')) {
    if (part === '' || part === '.') {
      continue
    }

    if (part === '..') {
      parts.pop()
      continue
    }

    parts.push(part)
  }

  return head + parts.join('/')
}

export function isAbsolute(path: string): boolean {
  return /^([a-zA-Z]:)?[\\/]/.test(path.trim())
}

export function join(base: string, path: string, isWindows: boolean): string {
  return normalize(isAbsolute(path) ? path : `${base}/${path}`, isWindows)
}

export function samePath(a: string, b: string, isWindows: boolean): boolean {
  const left = normalize(a, isWindows)
  const right = normalize(b, isWindows)

  return isWindows ? left.toLowerCase() === right.toLowerCase() : left === right
}

// True when `path` is `folder` or anywhere beneath it.
export function isInside(path: string, folder: string, isWindows: boolean): boolean {
  const fold = (text: string) => (isWindows ? text.toLowerCase() : text)
  const inner = fold(normalize(path, isWindows))
  const outer = fold(normalize(folder, isWindows)).replace(/\/$/, '')

  return inner === outer || inner.startsWith(`${outer}/`)
}

export function looksLikeWindows(cwd: string): boolean {
  return /^[a-zA-Z]:/.test(cwd)
}
