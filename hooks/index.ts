import type { Register } from 'claude-code'

import { register as drive } from './drive/register'
import { register as tree } from './tree'

// A plugin has one hooks module, so every rr mod registers from here.
export const register: Register = (on, options) => {
  tree(on, options)
  drive(on, options)
}
