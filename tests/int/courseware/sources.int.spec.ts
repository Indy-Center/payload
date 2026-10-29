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
  const DOCUMENTS =
    'These sources have an uploaded Indy document, which sources no longer keep: ' +
    'Example Handbook, Example Order. ' +
    'Give each an https link in place of its document and clear the upload, then migrate again.'
  const NO_LINK =
    'These sources have no link, which sources now need: Blank Notes, Unlinked Notes. ' +
    'Give each an https link, then migrate again.'

  type OldReference = { name: string; url: string | null; document: boolean }
  const linked: OldReference = {
    name: 'Another Order',
    url: 'https://example.com/a',
    document: false,
  }
  const plainHttp: OldReference = {
    name: 'Old Order',
    url: 'http://example.com/old',
    document: false,
  }
  const withDocuments: OldReference[] = [
    { name: 'Example Order', url: 'https://example.com/order', document: true },
    { name: 'Example Handbook', url: null, document: true },
  ]
  const withoutLinks: OldReference[] = [
    { name: 'Unlinked Notes', url: null, document: false },
    { name: 'Blank Notes', url: '', document: false },
  ]

  /**
   * Runs the migration over references in the old shape, as far as its check reads it, and
   * returns the message it stopped with. Every reference is still there afterwards.
   */
  async function refusalOver(references: OldReference[]): Promise<string> {
    const { pool, drizzle } = payload.db as unknown as PostgresAdapter
    await pool.query(`create table "references"
      ("id" uuid primary key, "name" varchar not null, "url" varchar, "document_id" uuid)`)
    try {
      for (const { name, url, document } of references) {
        await pool.query(
          `insert into "references" values (gen_random_uuid(), $1, $2, ${document ? 'gen_random_uuid()' : 'null'})`,
          [name, url],
        )
      }
      const message = await sourcesMigration
        .up({ db: drizzle, payload, req: {} as PayloadRequest })
        .then(
          () => 'The migration did not stop',
          (error: Error) => error.message,
        )
      const { rows } = await pool.query(`select count(*)::int as count from "references"`)
      expect(rows[0].count).toBe(references.length)
      return message
    } finally {
      await pool.query(`drop table "references"`)
    }
  }

  it('stops, naming them, when references have an uploaded document', async () => {
    expect(await refusalOver([...withDocuments, linked, plainHttp])).toBe(DOCUMENTS)
  })

  it('stops, naming them, when references have neither a link nor a document', async () => {
    expect(await refusalOver([...withoutLinks, linked, plainHttp])).toBe(NO_LINK)
  })

  it('names both kinds at once', async () => {
    expect(await refusalOver([...withDocuments, ...withoutLinks, linked])).toBe(
      `${DOCUMENTS} ${NO_LINK}`,
    )
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
      data: { name: 'Radio', citations: [{ source: order.id, place: '3-7-2' }] },
      ...asLead(),
    })

    const { body } = await callEndpoint(payload, '/courseware/catalogue')

    expect(body.sources).toEqual([
      { id: order.id, name: 'Example Order', edition: 'B', url: 'https://example.com/order' },
    ])
    expect(body.tasks[0].citations).toEqual([{ sourceId: order.id, place: '3-7-2', title: null }])
    expect(body).not.toHaveProperty('references')
  })

  it('carries a citation place and its title when it has one', async () => {
    const order = await payload.create({
      collection: 'sources',
      data: { name: 'Example Order', edition: 'B', url: 'https://example.com/order' },
      ...asLead(),
    })
    await payload.create({
      collection: 'tasks',
      data: {
        name: 'Radio',
        citations: [
          { source: order.id, place: '3-7-2', title: 'Radio checks' },
          { source: order.id, place: 'Chapter 4' },
        ],
      },
      ...asLead(),
    })

    const { body } = await callEndpoint(payload, '/courseware/catalogue')

    expect(body.tasks[0].citations).toEqual([
      { sourceId: order.id, place: '3-7-2', title: 'Radio checks' },
      { sourceId: order.id, place: 'Chapter 4', title: null },
    ])
    expect(body.tasks[0].citations[0]).not.toHaveProperty('section')
  })
})
