import type { Register } from 'claude-code'

const PANE = 'tree'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tree', description: 'Show the file tree in a pane' })

    return next(e)
  })

  on('command.run', { command: 'tree' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Tree' })

    return { text: 'Tree pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text dimColor>Tree is not built yet.</Text>
      </Box>
    )
  })
}
