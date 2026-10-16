import { Forbidden, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import { resetCourseware, testPayload } from '../courseware/helpers'

let payload: Payload
let admin: User

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

const resources = [{ title: 'Example handbook', url: 'https://example.com/handbook' }]

beforeEach(async () => {
  await resetCourseware(payload)
  admin = await account('admin@example.com', ['training:admin'])
})

describe('teacher resources', () => {
  it('are read and edited by the Training Admin', async () => {
    await payload.updateGlobal({ slug: 'teacher-resources', data: { resources }, ...as(admin) })

    const saved = await payload.findGlobal({ slug: 'teacher-resources', ...as(admin) })
    expect(saved.resources?.map((row) => row.title)).toEqual(['Example handbook'])
  })

  it('are closed to everyone else', async () => {
    const lead = await account('lead@example.com', ['training:lead'])
    const editor = await account('editor@example.com', ['partners:editor'])
    const nobody = await account('nobody@example.com')

    for (const user of [lead, editor, nobody]) {
      expect(await forbidden(payload.findGlobal({ slug: 'teacher-resources', ...as(user) }))).toBe(
        NOT_ALLOWED,
      )
      expect(
        await forbidden(
          payload.updateGlobal({ slug: 'teacher-resources', data: { resources }, ...as(user) }),
        ),
      ).toBe(NOT_ALLOWED)
    }
  })
})
