import type { SanitizedConfig } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'
import config from '@/payload.config'

/**
 * Payload hands `/api/<slug>/*` to a collection before it looks at root endpoints
 * (`handleEndpoints.js` in payload 3.90.2), so a collection slugged `public` would silently take
 * every route under `/api/public/v1/`. Globals live under `/api/globals/`, so a global may be
 * named `public`.
 */
function assertPublicNamespaceFree(config: { collections: { slug: string }[] }) {
  if (config.collections.some((collection) => collection.slug === 'public'))
    throw new Error(
      "A collection's slug is `public`. Payload routes /api/public/* to that collection before " +
        'root endpoints, so it would take every public read (decision 0005). Give it another slug.',
    )
}

let built: SanitizedConfig

beforeAll(async () => {
  built = await config
})

describe('the /api/public namespace', () => {
  it('is not taken by any collection', () => {
    expect(() => assertPublicNamespaceFree(built)).not.toThrow()
  })

  it('is refused to a collection slugged public, saying why', () => {
    const taken = {
      ...built,
      collections: [...built.collections, { ...built.collections[0], slug: 'public' }],
    }
    expect(() => assertPublicNamespaceFree(taken)).toThrow(
      "A collection's slug is `public`. Payload routes /api/public/* to that collection before " +
        'root endpoints, so it would take every public read (decision 0005). Give it another slug.',
    )
  })

  it('leaves a global named public alone', () => {
    const withGlobal = {
      ...built,
      globals: [...built.globals, { ...built.globals[0], slug: 'public' }],
    }
    expect(() => assertPublicNamespaceFree(withGlobal)).not.toThrow()
  })
})
