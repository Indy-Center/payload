import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PartnersDocument } from '@/partners/document'
import {
  TOKEN as LIBRARY_TOKEN,
  callEndpoint,
  resetCourseware,
  testPayload,
} from '../courseware/helpers'

const TOKEN = 'test-community-token'
process.env.COMMUNITY_API_TOKEN = TOKEN

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetCourseware(payload)
})

const read = (token: string | null = TOKEN) =>
  callEndpoint(payload, '/community/partners', { token })

async function category(name: string, order?: number) {
  return payload.create({
    collection: 'partner-categories',
    data: { name, blurb: `About ${name.toLowerCase()}.`, order },
  })
}

async function partner(
  name: string,
  categoryId: string,
  options: { status?: 'draft' | 'published'; order?: number } = {},
) {
  return payload.create({
    collection: 'partners',
    data: {
      name,
      category: categoryId,
      status: options.status ?? 'published',
      order: options.order,
      tagline: `${name} in one line.`,
      description: `${name} does made-up things.\n\nA second paragraph.`,
    },
  })
}

describe('GET /api/community/partners', () => {
  it('refuses a missing or wrong token', async () => {
    for (const token of [null, 'wrong', LIBRARY_TOKEN]) {
      expect(await read(token)).toEqual({ status: 401, body: { error: 'Unauthorized' } })
    }
  })

  it('returns the published partners inside their category', async () => {
    const developers = await category('Developers')
    await partner('Example Tools', developers.id)

    const { status, body } = await read()

    expect(status).toBe(200)
    expect(body as PartnersDocument).toEqual({
      categories: [
        {
          id: developers.id,
          name: 'Developers',
          blurb: 'About developers.',
          partners: [
            {
              slug: 'example-tools',
              name: 'Example Tools',
              tagline: 'Example Tools in one line.',
              description: 'Example Tools does made-up things.\n\nA second paragraph.',
            },
          ],
        },
      ],
    })
  })

  it('leaves out drafts and categories with no published partners', async () => {
    const developers = await category('Developers', 1)
    const creators = await category('Creators', 2)
    await category('Empty', 3)
    await partner('Example Tools', developers.id)
    await partner('Unfinished Tools', developers.id, { status: 'draft' })
    await partner('Example Stream', creators.id, { status: 'draft' })

    const { body } = await read()

    expect(
      (body as PartnersDocument).categories.map((group) => [
        group.name,
        group.partners.map((each) => each.name),
      ]),
    ).toEqual([['Developers', ['Example Tools']]])
  })

  it('orders categories by order, and partners by order then name', async () => {
    const second = await category('Creators', 2)
    const first = await category('Developers', 1)
    await partner('Zulu Tools', first.id, { order: 1 })
    await partner('Bravo Tools', first.id, { order: 2 })
    await partner('Alpha Tools', first.id, { order: 2 })
    await partner('Example Stream', second.id)

    const { body } = await read()

    expect(
      (body as PartnersDocument).categories.map((group) => [
        group.name,
        group.partners.map((each) => each.name),
      ]),
    ).toEqual([
      ['Developers', ['Zulu Tools', 'Alpha Tools', 'Bravo Tools']],
      ['Creators', ['Example Stream']],
    ])
  })
})
