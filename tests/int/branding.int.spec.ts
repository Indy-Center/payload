import { describe, it, expect, vi } from 'vitest'
// What Next calls for every admin page.
import { generateMetadata } from '@/app/(payload)/admin/[[...segments]]/page'
import { getNextRequestI18n } from '@payloadcms/next/utilities'
import config from '@/payload.config'

// Outside a request Next has no headers or cookies; the admin reads them only to pick a language.
vi.mock('next/headers.js', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}))

const metadataOf = (path: string) =>
  generateMetadata({
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
    '/nothing-here',
  ])('%s reads "Indy Center | CMS"', async (path) => {
    expect(await titleOf(path)).toBe('Indy Center | CMS')
  })
})

describe('admin page metadata', () => {
  it.each([
    '/login',
    '/',
    '/collections/lesson-plans',
    '/collections/lesson-plans/create',
    '/nothing-here',
  ])('%s names nothing after Payload', async (path) => {
    const metadata = await metadataOf(path)
    expect(JSON.stringify(metadata)).not.toMatch(/payload/i)
  })
})

describe('admin wording', () => {
  it('heads the account settings without naming Payload', async () => {
    const i18n = await getNextRequestI18n({ config: await config })
    expect(i18n.t('general:payloadSettings')).toBe('Settings')
  })
})
