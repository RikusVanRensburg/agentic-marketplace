import type { Register } from 'claude-code'

import { register as drive } from './drive/register'

// A plugin has one hooks module; this one registers the drive mod.
export const register: Register = (on, options) => {
  drive(on, options)
}
