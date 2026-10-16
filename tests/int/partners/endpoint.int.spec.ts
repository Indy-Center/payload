// @vitest-environment node
// Uploads are checked with `instanceof Uint8Array`, which jsdom's own globals fail.
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PartnersDocument } from '@/partners/document'
import type { Partner } from '@/payload-types'
import {
  TOKEN as LIBRARY_TOKEN,
  callEndpoint,
  resetDatabase,
  testPayload,
} from '../courseware/helpers'
import { image, removeUploads, svg, upload } from './helpers'

const TOKEN = 'test-community-token'
process.env.COMMUNITY_API_TOKEN = TOKEN

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await removeUploads(payload)
  await resetDatabase(payload)
})

afterAll(() => removeUploads(payload))

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
  options: {
    status?: 'draft' | 'published'
    order?: number
    logo?: string
    banner?: string
    gallery?: string[]
    tagline?: string
    description?: string
    callsToAction?: Partner['callsToAction']
    socialLinks?: Partner['socialLinks']
  } = {},
) {
  return payload.create({
    collection: 'partners',
    data: {
      name,
      category: categoryId,
      status: options.status ?? 'published',
      order: options.order,
      logo: options.logo ?? (await upload(payload, svg(), `${name} logo`)).id,
      banner: options.banner,
      gallery: options.gallery,
      tagline: options.tagline ?? `${name} in one line.`,
      description: options.description ?? `${name} does made-up things.\n\nA second paragraph.`,
      callsToAction: options.callsToAction ?? [
        { label: 'Visit website', url: 'https://example.com' },
      ],
      socialLinks: options.socialLinks,
    },
  })
}

// Published before the publishing rule existed: saved as a draft, then published straight
// to the database, past the rule.
async function publishedPastTheRule(
  name: string,
  categoryId: string,
  options: Omit<NonNullable<Parameters<typeof partner>[2]>, 'status'>,
) {
  const draft = await partner(name, categoryId, { ...options, status: 'draft' })
  await payload.db.updateOne({
    collection: 'partners',
    id: draft.id,
    data: { status: 'published' },
  })
}

const namesByCategory = (body: unknown) =>
  (body as PartnersDocument).categories.map((group) => [
    group.name,
    group.partners.map((each) => each.name),
  ])

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
              logo: {
                url: expect.stringMatching(/\/example(-\d+)?\.svg$/),
                alt: 'Example Tools logo',
                width: 300,
                height: 300,
              },
              banner: null,
              gallery: [],
              callsToAction: [{ label: 'Visit website', url: 'https://example.com' }],
              memberPerks: [],
              socialLinks: [],
            },
          ],
        },
      ],
    })
  })

  it('gives public calls to action and member perks apart, each in order, with social links', async () => {
    const developers = await category('Developers')
    await partner('Example Tools', developers.id, {
      callsToAction: [
        {
          label: 'Claim discount',
          url: 'https://example.com/discount',
          memberPerk: true,
          perkText: 'Members get 10% off with the made-up code EXAMPLE10.',
        },
        { label: 'Visit website', url: 'https://example.com' },
        {
          label: 'Join the made-up beta',
          url: 'https://example.com/beta',
          memberPerk: true,
          perkText: 'Early access.',
        },
        { label: 'Download', url: 'https://example.com/download' },
      ],
      socialLinks: [
        { platform: 'youtube', url: 'https://youtube.com/@example' },
        { platform: 'discord', url: 'https://discord.gg/example' },
      ],
    })

    const { body } = await read()
    const [shown] = (body as PartnersDocument).categories[0].partners

    expect(shown.callsToAction).toEqual([
      { label: 'Visit website', url: 'https://example.com' },
      { label: 'Download', url: 'https://example.com/download' },
    ])
    expect(shown.memberPerks).toEqual([
      {
        label: 'Claim discount',
        url: 'https://example.com/discount',
        text: 'Members get 10% off with the made-up code EXAMPLE10.',
      },
      { label: 'Join the made-up beta', url: 'https://example.com/beta', text: 'Early access.' },
    ])
    expect(shown.socialLinks).toEqual([
      { platform: 'youtube', url: 'https://youtube.com/@example' },
      { platform: 'discord', url: 'https://discord.gg/example' },
    ])
  })

  it('gives each image in the size the site shows it', async () => {
    const developers = await category('Developers')
    const logo = await upload(payload, await image(512, 512, 'png'), 'The Example Tools mark')
    const banner = await upload(payload, await image(3000, 1000, 'jpeg'), 'A made-up workshop')
    const wide = await upload(payload, await image(2000, 1500, 'jpeg'), 'A made-up screenshot')
    const small = await upload(payload, await image(300, 200, 'webp'), 'A small made-up photo')
    await partner('Example Tools', developers.id, {
      logo: logo.id,
      banner: banner.id,
      gallery: [wide.id, small.id],
    })

    const { body } = await read()
    const [shown] = (body as PartnersDocument).categories[0].partners

    expect(shown.logo).toEqual({
      url: expect.stringMatching(/-256x256\.png$/),
      alt: 'The Example Tools mark',
      width: 256,
      height: 256,
    })
    expect(shown.banner).toEqual({
      url: expect.stringMatching(/-2400x800\.jpg$/),
      alt: 'A made-up workshop',
      width: 2400,
      height: 800,
    })
    expect(shown.gallery).toEqual([
      {
        thumbnail: {
          url: expect.stringMatching(/-400x300\.jpg$/),
          alt: 'A made-up screenshot',
          width: 400,
          height: 300,
        },
        large: {
          url: expect.stringMatching(/-1600x1200\.jpg$/),
          alt: 'A made-up screenshot',
          width: 1600,
          height: 1200,
        },
      },
      // Smaller than both sizes, so served as it was uploaded.
      {
        thumbnail: {
          url: expect.stringMatching(/\/example(-\d+)?\.webp$/),
          alt: 'A small made-up photo',
          width: 300,
          height: 200,
        },
        large: {
          url: expect.stringMatching(/\/example(-\d+)?\.webp$/),
          alt: 'A small made-up photo',
          width: 300,
          height: 200,
        },
      },
    ])
  })

  it('leaves out drafts and categories with no published partners', async () => {
    const developers = await category('Developers', 1)
    const creators = await category('Creators', 2)
    await category('Empty', 3)
    await partner('Example Tools', developers.id)
    await partner('Unfinished Tools', developers.id, { status: 'draft' })
    await partner('Example Stream', creators.id, { status: 'draft' })

    const { body } = await read()

    expect(namesByCategory(body)).toEqual([['Developers', ['Example Tools']]])
  })

  it('leaves out a published partner without one to three public calls to action', async () => {
    const developers = await category('Developers')
    const visit = { label: 'Visit website', url: 'https://example.com' }
    const perk = { ...visit, memberPerk: true, perkText: 'A made-up discount.' }
    await partner('Example Tools', developers.id)
    await publishedPastTheRule('No Calls Tools', developers.id, { callsToAction: [] })
    await publishedPastTheRule('Only Perks Tools', developers.id, { callsToAction: [perk, perk] })
    await publishedPastTheRule('Four Calls Tools', developers.id, {
      callsToAction: [visit, visit, visit, visit, perk],
    })

    const { body } = await read()

    expect(namesByCategory(body)).toEqual([['Developers', ['Example Tools']]])
  })

  it('leaves out a published partner with a blank tagline or description', async () => {
    const developers = await category('Developers')
    await partner('Example Tools', developers.id)
    await publishedPastTheRule('No Tagline Tools', developers.id, { tagline: ' ' })
    await publishedPastTheRule('No Description Tools', developers.id, { description: '\n\n' })

    const { body } = await read()

    expect(namesByCategory(body)).toEqual([['Developers', ['Example Tools']]])
  })

  it('orders categories by order, and partners by order then name', async () => {
    const second = await category('Creators', 2)
    const first = await category('Developers', 1)
    await partner('Zulu Tools', first.id, { order: 1 })
    await partner('Bravo Tools', first.id, { order: 2 })
    await partner('Alpha Tools', first.id, { order: 2 })
    await partner('Example Stream', second.id)

    const { body } = await read()

    expect(namesByCategory(body)).toEqual([
      ['Developers', ['Zulu Tools', 'Alpha Tools', 'Bravo Tools']],
      ['Creators', ['Example Stream']],
    ])
  })
})
