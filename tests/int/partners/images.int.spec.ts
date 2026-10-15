// @vitest-environment node
// Uploads are checked with `instanceof Uint8Array`, which jsdom's own globals fail.
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PartnerCategory, User } from '@/payload-types'
import { resetCourseware, testPayload } from '../courseware/helpers'
import { file, image, invalid, removeUploads, svg, upload } from './helpers'

let payload: Payload
let editor: User
let developers: PartnerCategory

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
})

afterAll(() => removeUploads(payload))

/** Saves a draft partner as the editor, with access checks on. */
const save = ({
  name = 'Example Tools',
  ...images
}: {
  name?: string
  logo?: string
  banner?: string
  gallery?: string[]
}) =>
  payload.create({
    collection: 'partners',
    data: { name, category: developers.id, status: 'draft', ...images },
    user: editor,
    overrideAccess: false,
  })

describe('a partner’s logo', () => {
  it('accepts SVG, PNG and WebP', async () => {
    for (const file of [svg(), await image(256, 256, 'png'), await image(256, 256, 'webp')]) {
      const logo = await upload(payload, file)
      const partner = await save({ name: `Example ${file.name}`, logo: logo.id })
      expect(partner.logo).toMatchObject({ id: logo.id })
    }
  })

  it('refuses any other kind of file', async () => {
    const photo = await upload(payload, await image(256, 256, 'jpeg'))

    expect(await invalid(save({ logo: photo.id }))).toEqual([
      'The logo must be an SVG, PNG or WebP file.',
    ])
  })
})

describe('a partner’s gallery', () => {
  it('holds any number of photos, in order', async () => {
    const first = await upload(payload, await image(1200, 800, 'jpeg'))
    const second = await upload(payload, await image(800, 1200, 'webp'))

    const partner = await save({ gallery: [second.id, first.id] })

    expect(partner.gallery?.map((photo) => (typeof photo === 'string' ? photo : photo.id))).toEqual(
      [second.id, first.id],
    )
    expect((await save({ name: 'Another Example' })).gallery ?? []).toEqual([])
  })

  it('may show the same photo twice', async () => {
    const photo = await upload(payload, await image(1200, 800, 'jpeg'))

    const partner = await save({ gallery: [photo.id, photo.id] })

    expect(partner.gallery).toHaveLength(2)
  })

  it('refuses a file that isn’t an image', async () => {
    const notes = await upload(
      payload,
      file('notes.txt', 'text/plain', Buffer.from('Made-up notes.')),
    )

    expect(await invalid(save({ gallery: [notes.id] }))).toEqual(['Gallery photos must be images.'])
  })
})

describe('media uploads', () => {
  /** Noise doesn't compress, so this PNG stays just over the limit. */
  async function huge() {
    const data = await sharp({
      create: {
        width: 1900,
        height: 1900,
        channels: 3,
        background: 'black',
        noise: { type: 'gaussian', mean: 128, sigma: 60 },
      },
    })
      .png({ compressionLevel: 0 })
      .toBuffer()
    expect(data.length).toBeGreaterThan(10 * 1024 * 1024)
    return file('huge.png', 'image/png', data)
  }
  const TOO_BIG = 'Files over 10 MB can’t be uploaded; this one is 10.3 MB.'

  it('refuse a file over 10 MB', async () => {
    expect(await invalid(upload(payload, await huge()))).toEqual([TOO_BIG])
  })

  it('refuse a file over 10 MB in place of an existing one', async () => {
    const media = await upload(payload, await image(1600, 500))

    expect(
      await invalid(
        payload.update({ collection: 'media', id: media.id, data: {}, file: await huge() }),
      ),
    ).toEqual([TOO_BIG])
  })

  it('accept a file of 10 MB or less', async () => {
    const media = await upload(payload, await image(1600, 500))
    expect(media.filesize).toBeLessThan(10 * 1024 * 1024)
  })
})

describe('a partner’s banner', () => {
  it('may be left out', async () => {
    const partner = await save({})
    expect(partner.banner ?? null).toBeNull()
  })

  it('accepts an image of at least 1600×500', async () => {
    const banner = await upload(payload, await image(1600, 500, 'jpeg'))
    const partner = await save({ banner: banner.id })
    expect(partner.banner).toMatchObject({ id: banner.id })
  })

  it('refuses a smaller one', async () => {
    for (const [width, height] of [
      [1599, 500],
      [1600, 499],
    ]) {
      const banner = await upload(payload, await image(width, height, 'jpeg'))
      expect(await invalid(save({ banner: banner.id }))).toEqual([
        `The banner must be at least 1600×500 pixels; this one is ${width}×${height}.`,
      ])
    }
  })
})
