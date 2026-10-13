import type { Register } from 'claude-code'

import { register as drive } from './drive/register'

// A plugin has one hooks module, so every rr mod registers from here.
export const register: Register = (on, options) => {
  drive(on, options)
}
