// What the orchestrator's pane and band draw, kept in `$.state` so a write redraws them.

export type Group = 'blocked' | 'build' | 'integrate' | 'waiting' | 'done'

export type SliceRow = {
  id: string
  title: string
  repo: string
  mode: 'sonnet-first' | 'haiku-first'
  phase: string
  group: Group
  // 0 to 4: not started, dev, QA, integration, merged.
  stage: number
  round: number
  rungs: number
  role: string | null
  rung: string | null
  runningMs: number | null
  tokens: number
  waitingOn: string[]
  blocker: string | null
  defects: string[]
  worktree: string | null
  branch: string
  commit: string | null
  history: string[]
}

export type FinalRow = { repo: string; phase: string; round: number; findings: string[]; history: string[] }

export type RunView = {
  id: string
  title: string
  status: 'running' | 'done' | 'aborted'
  branches: string[]
  merged: number
  slices: number
  blocked: number
  agents: number
  tokens: number
  durationMs: number
  rows: SliceRow[]
  finals: FinalRow[]
  blockers: { at: string; reason: string }[]
}

export type PaneUi = { expanded: string | null; isDoneCollapsed: boolean; isBandHidden: boolean }

declare module 'claude-code' {
  interface PluginState {
    orchestrator: { view: RunView | null; ui: PaneUi }
  }
}
