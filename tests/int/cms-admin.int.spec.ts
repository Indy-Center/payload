import { Forbidden, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import { resetDatabase, testPayload } from './courseware/helpers'

let payload: Payload
let cmsAdmin: User
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

beforeEach(async () => {
  await resetDatabase(payload)
  cmsAdmin = await account('cms-admin@example.com', ['cms:admin'])
  nobody = await account('nobody@example.com')
})

describe('the CMS admin', () => {
  it('edits partners and partner categories', async () => {
    const category = await payload.create({
      collection: 'partner-categories',
      data: { name: 'Developers', blurb: 'People who build tools.' },
      ...as(cmsAdmin),
    })
    await payload.create({
      collection: 'partners',
      data: { name: 'Example Tools', category: category.id, status: 'draft' },
      ...as(cmsAdmin),
    })

    const { docs } = await payload.find({ collection: 'partners', ...as(cmsAdmin) })
    expect(docs.map((doc) => doc.name)).toEqual(['Example Tools'])
  })

  it('edits courseware', async () => {
    const task = await payload.create({
      collection: 'tasks',
      data: { name: 'Radio' },
      ...as(cmsAdmin),
    })
    const updated = await payload.update({
      collection: 'tasks',
      id: task.id,
      data: { retired: true },
      ...as(cmsAdmin),
    })
    expect(updated.retired).toBe(true)
  })

  it('edits teacher resources', async () => {
    const resources = [{ title: 'Example handbook', url: 'https://example.com/handbook' }]
    await payload.updateGlobal({ slug: 'teacher-resources', data: { resources }, ...as(cmsAdmin) })

    const saved = await payload.findGlobal({ slug: 'teacher-resources', ...as(cmsAdmin) })
    expect(saved.resources?.map((row) => row.title)).toEqual(['Example handbook'])
  })

  it('manages accounts and gives roles', async () => {
    const created = await payload.create({
      collection: 'users',
      data: { email: 'new@example.com', password: 'example-password' },
      ...as(cmsAdmin),
    })
    const updated = await payload.update({
      collection: 'users',
      id: created.id,
      data: { cid: '1000003', roles: ['partners:editor'] },
      ...as(cmsAdmin),
    })
    expect(updated.cid).toBe('1000003')
    expect(updated.roles).toEqual(['partners:editor'])

    await payload.delete({ collection: 'users', id: created.id, ...as(cmsAdmin) })
    expect(await payload.count({ collection: 'users' })).toEqual({ totalDocs: 2 })
  })
})

describe('roles, once a CMS admin exists', () => {
  it('are no longer open to any signed-in account', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: nobody.id,
      data: { roles: ['cms:admin'] },
      ...as(nobody),
    })
    expect(updated.roles).toEqual([])
  })
})

describe('everyone else', () => {
  it('still can’t reach partners', async () => {
    expect(await forbidden(payload.find({ collection: 'partners', ...as(nobody) }))).toBe(
      NOT_ALLOWED,
    )
  })
})
