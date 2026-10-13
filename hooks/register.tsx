import type { Register } from 'claude-code'

export const register: Register = on => {
  // Adds `$.worktree` for other mods. A call is the `worktree.<method>` event, which this
  // module's hooks answer with the session's `$`; the methods here are the chain's floor.
  on('engine.create', async ($, e, next) => {
    const built = await next(e)
    const unserved = { isDone: false, reason: 'worktree-lifecycle did not answer.' } as const

    return {
      ...built,
      worktree: {
        create: async () => unserved,
        ship: async () => unserved,
        clean: async () => unserved,
        sweep: async () => unserved,
        check: async () => unserved,
        list: async () => unserved,
        merged: async () => undefined,
      },
    }
  })
}
