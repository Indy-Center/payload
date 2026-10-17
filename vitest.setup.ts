// Any setup scripts you might need go here

import { vi } from 'vitest'

// Load .env files
import 'dotenv/config'

// Outside a request Next has no headers or cookies; the admin reads them only to pick a language.
// Mocked for every file, not in the one that needs it: files share a module graph, so a mock made
// in one would reach whichever files ran after it, and miss modules loaded before it.
vi.mock('next/headers.js', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}))
