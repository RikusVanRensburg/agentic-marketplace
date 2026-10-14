// The working-branch band: one row reading `org › repo › branch`, with a picker standing in
// for each part not chosen yet. The desktop draws the branch mark and the chevrons as small
// SVGs; the terminal draws them as text. The handlers come from register, which holds `$`.

import type { Elements, RenderSurface } from 'claude-code'

import type { WorktreeScope } from '../types'
import { OTHER_BRANCH, OTHER_REPO, labelOf, nameOf } from './working'

type Ui = Elements['terminal'] | Elements['desktop'] | Elements['vscode']

export type BandActions = {
  repo: (root: string) => void
  branch: (branch: string) => void
  working: (value: string) => void
  keep: () => void
}

// Mid tones that read on a light and a dark app alike: the SVGs are drawn as images, so
// they cannot take the host's colours.
const ACCENT = '#d97757'
const MUTED = '#8a877f'

const branchMark = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 7.5v9"/><path d="M18 10.5c0 4-6 3-11.2 6.5"/></svg>`

const CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`

const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))

export function scopeRow(ui: Ui, surface: RenderSurface, where: WorktreeScope, act: BandActions) {
  const { Box, Button, Input, Select, Text } = ui
  // The terminal's table answers Svg with an empty box, so the surface decides.
  const Svg = surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined
  const isWorking = !where.isPicking && where.working !== null
  const root = isWorking ? (where.working?.root ?? null) : where.root
  const org = where.org ?? (root === null ? '' : parentOf(root))

  const mark =
    Svg === undefined ? (
      <Text {...(isWorking ? { color: ACCENT } : { dimColor: true })}>⎇</Text>
    ) : (
      <Svg source={branchMark(isWorking ? ACCENT : MUTED)} alt="Working branch" width={16} height={16} />
    )
  const chevron = () => (Svg === undefined ? <Text dimColor>›</Text> : <Svg source={CHEVRON} alt="" width={12} height={12} />)
  const parts = [mark, <Text dimColor>{nameOf(org)}</Text>, chevron()]

  if (isWorking && where.working !== null) {
    const current = where.working
    const trees = where.branches.filter(one => one.path !== null)
    const listed = trees.some(one => one.branch === current.branch) ? trees : [current, ...trees]
    const options = [
      ...listed.map(one => ({ value: one.branch, label: labelOf(one) })),
      { value: OTHER_BRANCH, label: 'Other branch...' },
      ...(where.org === null ? [] : [{ value: OTHER_REPO, label: 'Other repo...' }]),
    ]

    parts.push(
      <Text bold>{nameOf(current.root)}</Text>,
      chevron(),
      <Select key="working" options={options} value={current.branch} onSelect={value => act.working(value)} />,
    )

    if (current.base !== null) {
      parts.push(<Text dimColor>{`from ${current.base}`}</Text>)
    }

    parts.push(<Box flexGrow={1} />, <Text dimColor>{`${trees.length} worktree${trees.length === 1 ? '' : 's'}`}</Text>)
  } else {
    if (where.org !== null) {
      const repos = where.repos.map(one => ({ value: one, label: nameOf(one) }))
      parts.push(<Select key="repo" options={[{ value: '', label: 'Choose repo' }, ...repos]} value={where.root ?? ''} onSelect={value => act.repo(value)} />)
    } else if (where.root !== null) {
      parts.push(<Text bold>{nameOf(where.root)}</Text>)
    }

    parts.push(chevron())

    if (where.root === null) {
      parts.push(<Text dimColor>branch</Text>)
    } else {
      const branches = where.branches.map(one => ({ value: one.branch, label: labelOf(one) }))
      parts.push(
        <Select key="branch" options={[{ value: '', label: 'Choose branch' }, ...branches]} value="" onSelect={value => act.branch(value)} />,
        <Input key="branch-name" placeholder="or type a branch" submitLabel="use" onSubmit={value => act.branch(value)} />,
      )
    }

    if (where.note !== null) {
      parts.push(<Text dimColor>{where.note}</Text>)
    }

    if (where.working !== null) {
      parts.push(<Box flexGrow={1} />, <Button key="keep" label={`Keep ${where.working.branch}`} plain dimColor onPress={() => act.keep()} />)
    }
  }

  // The right edge stays clear: the band draws its own collapse mark ([-]) there.
  return (
    <Box flexDirection="row" alignItems="center" columnGap={1} flexWrap="wrap" paddingRight={5}>
      {parts}
    </Box>
  )
}
