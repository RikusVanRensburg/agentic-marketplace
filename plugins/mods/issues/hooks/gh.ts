// The gh side of the issues mod. Every call names its repo with -R or a full api path,
// so it works from any folder, the org folder included.

export type Ran = { exitCode: number; stdout: string; stderr: string }

// What the issues mod needs from the engine. register.ts builds it from `$`, since `$`
// itself may not be handed across an import; a test builds it from a fake gh.
export type Io = {
  run: (argv: readonly string[], init?: { stdin?: string }) => Promise<Ran>
  now: () => Promise<number>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  storeDelete: (key: string) => Promise<void>
}

export type Repo = { owner: string; name: string; slug: string }

const firstLine = (text: string) => text.trim().split('\n')[0] ?? ''

// Runs gh and returns its stdout, or throws with what gh said.
export const gh = async (io: Io, args: readonly string[], stdin?: string): Promise<string> => {
  const ran = await io.run(['gh', ...args], stdin === undefined ? undefined : { stdin })
  if (ran.exitCode !== 0) throw new Error(`gh ${args.slice(0, 2).join(' ')}: ${firstLine(ran.stderr) || firstLine(ran.stdout) || `exit ${ran.exitCode}`}`)
  return ran.stdout
}

// Runs gh where a failure is an answer (a 404 for an org with no issue types).
export const ghMaybe = async (io: Io, args: readonly string[]): Promise<string | undefined> => {
  const ran = await io.run(['gh', ...args])
  return ran.exitCode === 0 ? ran.stdout : undefined
}

export const lines = (text: string) =>
  text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

const SLUG = /^([\w.-]+)\/([\w.-]+)$/

// The repo named, or the one the session's folder is a clone of.
export const repoOf = async (io: Io, repo?: string): Promise<Repo> => {
  const named = (repo ?? '').trim()
  const slug = named || firstLine(await gh(io, ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).catch(() => ''))
  const m = SLUG.exec(slug)
  if (!m) throw new Error(named ? `repo must be owner/name, not "${named}"` : 'this folder is not a GitHub clone; pass repo as owner/name')
  return { owner: m[1] ?? '', name: m[2] ?? '', slug }
}

export const api = (r: Repo, path: string) => `repos/${r.owner}/${r.name}/${path}`

export const labelsOf = async (io: Io, r: Repo) =>
  lines(await gh(io, ['label', 'list', '-R', r.slug, '--limit', '1000', '--json', 'name', '--jq', '.[].name']))

// The org's native issue types; none for a user's repo or an org without them.
export const issueTypesOf = async (io: Io, r: Repo) =>
  lines((await ghMaybe(io, ['api', `orgs/${r.owner}/issue-types`, '--jq', '.[].name'])) ?? '')

export const milestonesOf = async (io: Io, r: Repo) =>
  lines(await gh(io, ['api', '--paginate', api(r, 'milestones'), '--jq', '.[].title']))

// Always paginated: a parent can hold more than one page of children.
export const subIssuesOf = async (io: Io, r: Repo, parent: number) =>
  lines(await gh(io, ['api', '--paginate', api(r, `issues/${parent}/sub_issues`), '--jq', '.[].number'])).map(Number)

export type IssueView = {
  number: number
  title: string
  url: string
  state: string
  labels: string[]
  assignees: string[]
  type?: string
  milestone?: string
}

export const viewOf = async (io: Io, r: Repo, n: number): Promise<IssueView> => {
  const raw = JSON.parse(
    await gh(io, ['issue', 'view', String(n), '-R', r.slug, '--json', 'number,title,url,state,labels,assignees,type,milestone']),
  ) as {
    number: number
    title: string
    url: string
    state: string
    labels?: { name: string }[]
    assignees?: { login: string }[]
    type?: { name?: string } | null
    milestone?: { title?: string } | null
  }
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    state: raw.state,
    labels: (raw.labels ?? []).map(l => l.name),
    assignees: (raw.assignees ?? []).map(a => a.login),
    type: raw.type?.name || undefined,
    milestone: raw.milestone?.title || undefined,
  }
}

export const dependenciesOf = async (io: Io, r: Repo, n: number) => {
  const raw = JSON.parse((await gh(io, ['api', api(r, `issues/${n}`), '--jq', '.issue_dependencies_summary // {}'])) || '{}') as {
    blocked_by?: number
    blocking?: number
  }
  return { blockedBy: raw.blocked_by ?? 0, blocking: raw.blocking ?? 0 }
}
