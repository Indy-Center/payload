import { describe, it, expect, vi } from 'vitest'
import { generatePageMetadata } from '@payloadcms/next/views'
import config from '@/payload.config'

// Outside a request Next has no headers or cookies; the admin reads them only to pick a language.
vi.mock('next/headers.js', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}))

const metadataOf = (path: string) =>
  generatePageMetadata({
    config,
    params: Promise.resolve({ segments: path.split('/').filter(Boolean) }),
    searchParams: Promise.resolve({}),
  })

const titleOf = async (path: string) => (await metadataOf(path)).title

describe('admin page titles', () => {
  it.each([
    '/login',
    '/forgot',
    '/create-first-user',
    '/',
    '/account',
    '/collections/lesson-plans',
    '/collections/lesson-plans/create',
    '/collections/lesson-plans/0190a8e2-0000-7000-8000-000000000000',
    '/collections/lesson-plans/0190a8e2-0000-7000-8000-000000000000/api',
    '/collections/lesson-plans/0190a8e2-0000-7000-8000-000000000000/versions',
    '/collections/users',
  ])('%s reads "Indy Center | CMS"', async (path) => {
    expect(await titleOf(path)).toBe('Indy Center | CMS')
  })
})

describe('admin page metadata', () => {
  it.each(['/login', '/', '/collections/lesson-plans', '/collections/lesson-plans/create'])(
    '%s names nothing after Payload',
    async (path) => {
      const metadata = await metadataOf(path)
      expect(JSON.stringify(metadata)).not.toMatch(/payload/i)
    },
  )
})
