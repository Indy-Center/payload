// @vitest-environment node
// Uploads are checked with `instanceof Uint8Array`, which jsdom's own globals fail.
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Partner, PartnerCategory, User } from '@/payload-types'
import { resetCourseware, testPayload } from '../courseware/helpers'
import { invalid, removeUploads, svg, upload } from './helpers'

let payload: Payload
let editor: User
let developers: PartnerCategory
let logo: string

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await removeUploads(payload)
  await resetCourseware(payload)
  editor = await payload.create({
    collection: 'users',
    data: { email: 'editor@example.com', password: 'example-password', roles: ['partners:editor'] },
  })
  developers = await payload.create({
    collection: 'partner-categories',
    data: { name: 'Developers', blurb: 'People who build tools.' },
  })
  logo = (await upload(payload, svg(), 'The Example Tools mark')).id
})

afterAll(() => removeUploads(payload))

const asEditor = () => ({ user: editor, overrideAccess: false })

type Fields = Partial<Omit<Partner, 'id' | 'createdAt' | 'updatedAt' | 'category'>>

const visit = { label: 'Visit website', url: 'https://example.com' }
const perk = {
  label: 'Claim discount',
  url: 'https://example.com/discount',
  memberPerk: true,
  perkText: 'Members get 10% off with the made-up code EXAMPLE10.',
}

/** Everything a published partner needs. */
const complete = (): Fields => ({
  logo,
  tagline: 'Made-up tools for made-up controllers.',
  description: 'Example Tools builds made-up things.',
  callsToAction: [visit],
})

/** Creates a partner as the editor, with access checks on. */
const create = (fields: Fields) =>
  payload.create({
    collection: 'partners',
    data: { name: 'Example Tools', category: developers.id, status: 'draft', ...fields },
    ...asEditor(),
  })

const publish = (fields: Fields) => create({ ...fields, status: 'published' })

describe('a call to action', () => {
  it('needs perk text when it is a member perk', async () => {
    expect(await invalid(create({ callsToAction: [{ ...perk, perkText: ' ' }] }))).toEqual([
      'Say what members get from this perk.',
    ])
  })

  it('needs a web address', async () => {
    expect(
      await invalid(create({ callsToAction: [{ label: 'Run', url: 'javascript:alert(1)' }] })),
    ).toEqual(['Enter a web address starting with https:// or http://.'])
  })
})

describe('social links', () => {
  it('pair a platform from the list with a web address', async () => {
    const partner = await create({
      socialLinks: [
        { platform: 'twitch', url: 'https://twitch.tv/example' },
        { platform: 'web', url: 'https://example.com' },
      ],
    })
    expect(partner.socialLinks?.map(({ platform, url }) => [platform, url])).toEqual([
      ['twitch', 'https://twitch.tv/example'],
      ['web', 'https://example.com'],
    ])
  })

  it('refuse a platform that isn’t on the list, or an address that isn’t a web address', async () => {
    expect(
      await invalid(
        create({
          socialLinks: [
            // @ts-expect-error -- not one of the platforms
            { platform: 'myspace', url: 'https://example.com' },
            { platform: 'github', url: 'example.com' },
          ],
        }),
      ),
    ).toEqual([
      'This field has an invalid selection.',
      'Enter a web address starting with https:// or http://.',
    ])
  })
})

describe('publishing a partner', () => {
  it('succeeds once the partner is complete', async () => {
    const partner = await publish(complete())
    expect(partner.status).toBe('published')
  })

  it('is refused without a logo, tagline, description or call to action', async () => {
    expect(await invalid(publish({}))).toEqual([
      'Give the partner a logo before publishing it.',
      'Give the partner a tagline before publishing it.',
      'Give the partner a description before publishing it.',
      'Give the partner a call to action that isn’t a member perk before publishing it.',
    ])
  })

  it('treats blank text as missing', async () => {
    expect(await invalid(publish({ ...complete(), tagline: '  ', description: '\n\n' }))).toEqual([
      'Give the partner a tagline before publishing it.',
      'Give the partner a description before publishing it.',
    ])
  })

  it('does not count member perks as calls to action', async () => {
    expect(await invalid(publish({ ...complete(), callsToAction: [perk] }))).toEqual([
      'Give the partner a call to action that isn’t a member perk before publishing it.',
    ])
  })

  it('is refused with more than three public calls to action, however many perks', async () => {
    const three = [visit, visit, visit]
    expect((await publish({ ...complete(), callsToAction: [...three, perk, perk] })).status).toBe(
      'published',
    )

    expect(await invalid(publish({ ...complete(), callsToAction: [...three, visit] }))).toEqual([
      'A published partner has at most 3 calls to action that aren’t member perks; this one has 4.',
    ])
  })

  it('checks the stored partner along with the change', async () => {
    const draft = await create({ ...complete(), tagline: null })

    const publishing = payload.update({
      collection: 'partners',
      id: draft.id,
      data: { status: 'published' },
      ...asEditor(),
    })
    expect(await invalid(publishing)).toEqual(['Give the partner a tagline before publishing it.'])

    const published = await payload.update({
      collection: 'partners',
      id: draft.id,
      data: { status: 'published', tagline: 'Made-up tools.' },
      ...asEditor(),
    })
    expect(published.status).toBe('published')

    const emptying = payload.update({
      collection: 'partners',
      id: draft.id,
      data: { callsToAction: [] },
      ...asEditor(),
    })
    expect(await invalid(emptying)).toEqual([
      'Give the partner a call to action that isn’t a member perk before publishing it.',
    ])
  })

  it('leaves a draft free to be incomplete', async () => {
    const draft = await create({ callsToAction: [visit, visit, visit, visit] })
    expect(draft.status).toBe('draft')
    expect(draft.logo ?? null).toBeNull()
  })
})
