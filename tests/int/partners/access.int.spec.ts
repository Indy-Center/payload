import { Forbidden, ValidationError, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Partner, User } from '@/payload-types'
import { resetDatabase, testPayload } from '../courseware/helpers'

let payload: Payload
let editor: User
let admin: User
let lead: User
let nobody: User

beforeAll(async () => {
  payload = await testPayload()
})

async function account(email: string, roles: User['roles'] = []): Promise<User> {
  return payload.create({
    collection: 'users',
    data: { email, password: 'example-password', roles },
  })
}

const as = (user: User) => ({ user, overrideAccess: false })

/** The message Payload gives when access is refused. */
async function forbidden(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Forbidden) return error.message
    throw error
  }
  throw new Error('Expected the request to be refused')
}
const NOT_ALLOWED = 'You are not allowed to perform this action.'

/** The messages a person sees when a save is refused as invalid. */
async function invalid(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) return error.data.errors.map((entry) => entry.message)
    throw error
  }
  throw new Error('Expected the save to be refused')
}

beforeEach(async () => {
  await resetDatabase(payload)
  editor = await account('editor@example.com', ['partners:editor'])
  admin = await account('admin@example.com', ['training:admin'])
  lead = await account('lead@example.com', ['training:lead'])
  nobody = await account('nobody@example.com')
})

describe('partner categories', () => {
  it('are created, edited and deleted by partners editors', async () => {
    const category = await payload.create({
      collection: 'partner-categories',
      data: { name: 'Developers', blurb: 'People who build tools.', order: 1 },
      ...as(editor),
    })
    await payload.update({
      collection: 'partner-categories',
      id: category.id,
      data: { name: 'Builders' },
      ...as(editor),
    })
    const { docs } = await payload.find({ collection: 'partner-categories', ...as(editor) })
    expect(docs.map((doc) => doc.name)).toEqual(['Builders'])

    await payload.delete({ collection: 'partner-categories', id: category.id, ...as(editor) })
    expect(await payload.count({ collection: 'partner-categories' })).toEqual({ totalDocs: 0 })
  })

  it('are closed to everyone else', async () => {
    const category = await payload.create({
      collection: 'partner-categories',
      data: { name: 'Developers', blurb: 'People who build tools.' },
    })

    for (const user of [admin, lead, nobody]) {
      expect(
        await forbidden(
          payload.create({
            collection: 'partner-categories',
            data: { name: 'Creators', blurb: 'People who stream.' },
            ...as(user),
          }),
        ),
      ).toBe(NOT_ALLOWED)
      expect(
        await forbidden(
          payload.update({
            collection: 'partner-categories',
            id: category.id,
            data: { name: 'Renamed' },
            ...as(user),
          }),
        ),
      ).toBe(NOT_ALLOWED)
      expect(
        await forbidden(
          payload.delete({ collection: 'partner-categories', id: category.id, ...as(user) }),
        ),
      ).toBe(NOT_ALLOWED)
      expect(await forbidden(payload.find({ collection: 'partner-categories', ...as(user) }))).toBe(
        NOT_ALLOWED,
      )
    }
  })

  it('can’t be deleted while a partner is in one, even a draft', async () => {
    const category = await payload.create({
      collection: 'partner-categories',
      data: { name: 'Developers', blurb: 'People who build tools.' },
    })
    await payload.create({
      collection: 'partners',
      data: { name: 'Example Tools', category: category.id, status: 'draft' },
    })

    await expect(
      payload.delete({ collection: 'partner-categories', id: category.id, ...as(editor) }),
    ).rejects.toThrow(
      'Developers still has 1 partner. Move it to another category or delete it first.',
    )
    expect(await payload.count({ collection: 'partner-categories' })).toEqual({ totalDocs: 1 })
  })

  it('are refused one by one in a bulk delete, and the empty ones deleted', async () => {
    const named = (name: string) =>
      payload.create({
        collection: 'partner-categories',
        data: { name, blurb: `About ${name.toLowerCase()}.` },
      })
    const developers = await named('Developers')
    const creators = await named('Creators')
    await named('Empty')
    await named('Also Empty')
    for (const [name, categoryId] of [
      ['Example Tools', developers.id],
      ['Example Stream', creators.id],
      ['Another Stream', creators.id],
    ]) {
      await payload.create({
        collection: 'partners',
        data: { name, category: categoryId, status: 'draft' },
      })
    }

    const { docs, errors } = await payload.delete({
      collection: 'partner-categories',
      where: { id: { exists: true } },
      ...as(editor),
    })

    expect(docs.map((category) => category.name).sort()).toEqual(['Also Empty', 'Empty'])
    expect(errors.map((error) => error.message).sort()).toEqual([
      'Creators still has 2 partners. Move them to another category or delete them first.',
      'Developers still has 1 partner. Move it to another category or delete it first.',
    ])
    const { docs: left } = await payload.find({ collection: 'partner-categories' })
    expect(left.map((category) => category.name).sort()).toEqual(['Creators', 'Developers'])
  })
})

describe('partners', () => {
  async function category() {
    return payload.create({
      collection: 'partner-categories',
      data: { name: 'Developers', blurb: 'People who build tools.' },
    })
  }

  it('are created as drafts, edited and deleted by partners editors', async () => {
    const { id: categoryId } = await category()
    // Status left out, as an editor leaves it: the generated type lists it because it is required.
    const draft = { name: 'Example Tools', category: categoryId } as Pick<
      Partner,
      'name' | 'category' | 'status'
    >
    const partner = await payload.create({ collection: 'partners', data: draft, ...as(editor) })
    expect(partner).toMatchObject({ slug: 'example-tools', status: 'draft' })

    await payload.update({
      collection: 'partners',
      id: partner.id,
      data: { slug: 'tools', tagline: 'Made-up tools for made-up controllers.' },
      ...as(editor),
    })
    const { docs } = await payload.find({ collection: 'partners', ...as(editor) })
    expect(docs.map((doc) => doc.slug)).toEqual(['tools'])
    const cleared = await payload.update({
      collection: 'partners',
      id: partner.id,
      data: { slug: '' },
      ...as(editor),
    })
    expect(cleared.slug).toBe('example-tools')

    await payload.delete({ collection: 'partners', id: partner.id, ...as(editor) })
    expect(await payload.count({ collection: 'partners' })).toEqual({ totalDocs: 0 })
  })

  it('are closed to everyone else', async () => {
    const { id: categoryId } = await category()
    const partner = await payload.create({
      collection: 'partners',
      data: { name: 'Example Tools', category: categoryId, status: 'draft' },
    })

    for (const user of [admin, lead, nobody]) {
      expect(
        await forbidden(
          payload.create({
            collection: 'partners',
            data: { name: 'Example Stream', category: categoryId, status: 'draft' },
            ...as(user),
          }),
        ),
      ).toBe(NOT_ALLOWED)
      expect(
        await forbidden(
          payload.update({
            collection: 'partners',
            id: partner.id,
            data: { status: 'published' },
            ...as(user),
          }),
        ),
      ).toBe(NOT_ALLOWED)
      expect(
        await forbidden(payload.delete({ collection: 'partners', id: partner.id, ...as(user) })),
      ).toBe(NOT_ALLOWED)
      expect(await forbidden(payload.find({ collection: 'partners', ...as(user) }))).toBe(
        NOT_ALLOWED,
      )
    }
  })

  it('never share a slug', async () => {
    const { id: categoryId } = await category()
    await payload.create({
      collection: 'partners',
      data: { name: 'Example Tools', category: categoryId, status: 'draft' },
      ...as(editor),
    })

    expect(
      await invalid(
        payload.create({
          collection: 'partners',
          data: { name: 'Example Tools', category: categoryId, status: 'draft' },
          ...as(editor),
        }),
      ),
    ).toEqual(['Value must be unique'])
  })

  it('keep slugs fit for an address', async () => {
    const { id: categoryId } = await category()
    const partner = await payload.create({
      collection: 'partners',
      data: {
        name: 'Example Tools',
        slug: 'Example Tools 2',
        category: categoryId,
        status: 'draft',
      },
      ...as(editor),
    })
    expect(partner.slug).toBe('example-tools-2')

    expect(
      await invalid(
        payload.create({
          collection: 'partners',
          data: { name: '!!!', category: categoryId, status: 'draft' },
          ...as(editor),
        }),
      ),
    ).toEqual(['Give the partner a slug: its name has no letters or digits to make one from.'])
  })

  it('keep taglines to 120 characters', async () => {
    const { id: categoryId } = await category()

    expect(
      await invalid(
        payload.create({
          collection: 'partners',
          data: {
            name: 'Example Tools',
            category: categoryId,
            status: 'draft',
            tagline: 'x'.repeat(121),
          },
          ...as(editor),
        }),
      ),
    ).toEqual(['This value must be shorter than the max length of 120 characters.'])
  })
})
