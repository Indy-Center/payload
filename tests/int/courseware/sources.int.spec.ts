import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { ValidationError, type Payload, type PayloadRequest } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as sourcesMigration from '@/migrations/20261026_014802_sources_replace_references'
import type { User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

let payload: Payload
let lead: User

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  lead = await payload.create({
    collection: 'users',
    data: {
      email: 'lead@example.com',
      password: 'example-password',
      cid: '1000009',
      roles: ['training:lead'],
    },
  })
})

const asLead = () => ({ user: lead, overrideAccess: false })

async function refusal(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) return error.data.errors.map((entry) => entry.message)
    throw error
  }
  throw new Error('Expected the save to be refused')
}

describe('a source', () => {
  it('is saved with a name, an edition and an https link', async () => {
    const source = await payload.create({
      collection: 'sources',
      data: { name: 'Example Order', edition: 'B', url: 'https://example.com/order' },
      ...asLead(),
    })

    expect(source).toMatchObject({
      name: 'Example Order',
      edition: 'B',
      url: 'https://example.com/order',
    })
  })

  it('needs a link', async () => {
    expect(
      await refusal(
        payload.create({
          collection: 'sources',
          data: { name: 'Example Order', edition: 'B', url: '' },
          ...asLead(),
        }),
      ),
    ).toEqual(['A source needs a link, starting with https://.'])
  })

  it('needs its link to start with https', async () => {
    for (const url of ['http://example.com/order', 'example.com/order', 'ftp://example.com']) {
      expect(
        await refusal(
          payload.create({
            collection: 'sources',
            data: { name: 'Example Order', url },
            ...asLead(),
          }),
        ),
      ).toEqual(['A link starts with https://.'])
    }
  })

  it('has no upload', async () => {
    const source = await payload.create({
      collection: 'sources',
      data: { name: 'Example Order', url: 'https://example.com/order' },
      ...asLead(),
    })

    expect(source).not.toHaveProperty('document')
  })
})

describe('the migration from references', () => {
  it('stops, naming them, when references have an uploaded document', async () => {
    const { pool, drizzle } = payload.db as unknown as PostgresAdapter
    // The old shape, as far as the check reads it.
    await pool.query(`
      create table "references" ("id" uuid primary key, "name" varchar not null, "document_id" uuid);
      insert into "references" values
        (gen_random_uuid(), 'Example Order', gen_random_uuid()),
        (gen_random_uuid(), 'Another Order', null),
        (gen_random_uuid(), 'Example Handbook', gen_random_uuid());
    `)
    try {
      await expect(
        sourcesMigration.up({ db: drizzle, payload, req: {} as PayloadRequest }),
      ).rejects.toThrow(
        'These sources have an uploaded Indy document, which sources no longer keep: ' +
          'Example Handbook, Example Order.',
      )
      const { rows } = await pool.query(`select count(*)::int as count from "references"`)
      expect(rows[0].count).toBe(3)
    } finally {
      await pool.query(`drop table "references"`)
    }
  })
})

describe('the catalogue', () => {
  it('serves sources, and each citation names its source', async () => {
    const order = await payload.create({
      collection: 'sources',
      data: { name: 'Example Order', edition: 'B', url: 'https://example.com/order' },
      ...asLead(),
    })
    await payload.create({
      collection: 'tasks',
      data: { name: 'Radio', citations: [{ source: order.id, section: '3-7-2' }] },
      ...asLead(),
    })

    const { body } = await callEndpoint(payload, '/courseware/catalogue')

    expect(body.sources).toEqual([
      { id: order.id, name: 'Example Order', edition: 'B', url: 'https://example.com/order' },
    ])
    expect(body.tasks[0].citations).toEqual([{ sourceId: order.id, section: '3-7-2' }])
    expect(body).not.toHaveProperty('references')
  })
})
