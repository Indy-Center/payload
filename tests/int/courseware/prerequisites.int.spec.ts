import { Forbidden, ValidationError, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Course, Credential, User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

let payload: Payload
let lead: User
let admin: User
let author: User
let ground: Credential
let approach: Credential
let local: Credential

beforeAll(async () => {
  payload = await testPayload()
})

async function account(email: string, cid: string, roles: User['roles'] = []): Promise<User> {
  return payload.create({
    collection: 'users',
    data: { email, password: 'example-password', cid, roles },
  })
}

function credential(data: Pick<Credential, 'code' | 'kind' | 'name'> & Partial<Credential>) {
  return payload.create({ collection: 'credentials', data })
}

beforeEach(async () => {
  await resetDatabase(payload)
  admin = await account('admin@example.com', '1000000', ['training:admin'])
  lead = await account('lead@example.com', '1000009', ['training:lead'])
  author = await account('author@example.com', '1000001')
  ground = await credential({
    code: 'X-GC',
    kind: 'certification',
    name: 'Example Ground',
    rank: 1,
  })
  approach = await credential({
    code: 'Y-GC',
    kind: 'certification',
    name: 'Other Ground',
    rank: 2,
  })
  local = await credential({ code: 'X-LC', kind: 'endorsement', name: 'Example Local' })
})

const as = (user: User) => ({ user, overrideAccess: false })

/** A made-up course with no editions, written by `author`. */
function course(code = 'X-TWR') {
  return payload.create({
    collection: 'courses',
    data: { code, title: `Example ${code}`, authors: [author.cid!] },
  })
}

const ids = (values: (string | { id: string })[] | null | undefined) =>
  (values ?? []).map((value) => (typeof value === 'string' ? value : value.id))

async function refusal(promise: Promise<unknown>): Promise<{ path: string; message: string }[]> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError)
      return error.data.errors.map(({ path, message }) => ({ path, message }))
    throw error
  }
  throw new Error('Expected the save to be refused')
}

describe("a course's prerequisites", () => {
  it('are rows of "one of these" credentials, set by the Training Admin and leads', async () => {
    const { id } = await course()

    for (const user of [admin, lead]) {
      const saved = await payload.update({
        collection: 'courses',
        id,
        data: {
          prerequisites: [{ anyOf: [ground.id, approach.id] }, { anyOf: [local.id] }],
        },
        depth: 0,
        ...as(user),
      })
      expect(saved.prerequisites?.map((row) => ids(row.anyOf))).toEqual([
        [ground.id, approach.id],
        [local.id],
      ])
    }
  })

  it('start empty', async () => {
    const created = await course()
    expect(created.prerequisites ?? []).toEqual([])
    expect(created.credentialIssued ?? null).toBeNull()
  })

  it('refuse a row with no credential', async () => {
    const { id } = await course()

    expect(
      await refusal(
        payload.update({
          collection: 'courses',
          id,
          data: { prerequisites: [{ anyOf: [ground.id] }, { anyOf: [] }] },
          ...as(lead),
        }),
      ),
    ).toEqual([
      {
        path: 'prerequisites.1.anyOf',
        message: 'A prerequisite row names at least one credential. Remove the row if it is empty.',
      },
    ])
  })

  it('refuse a credential named twice, in one row or across rows', async () => {
    const { id } = await course()
    const twice = 'X-GC is named twice in the prerequisites. Name each credential once.'
    const save = (prerequisites: { anyOf: string[] }[]) =>
      payload.update({ collection: 'courses', id, data: { prerequisites }, ...as(lead) })

    expect(await refusal(save([{ anyOf: [ground.id, approach.id, ground.id] }]))).toEqual([
      { path: 'prerequisites.0.anyOf', message: twice },
    ])
    expect(await refusal(save([{ anyOf: [ground.id] }, { anyOf: [local.id, ground.id] }]))).toEqual(
      [{ path: 'prerequisites.1.anyOf', message: twice }],
    )

    const saved = await save([{ anyOf: [ground.id, approach.id] }, { anyOf: [local.id] }])
    expect(saved.prerequisites).toHaveLength(2)
  })

  it('refuse requiring the credential the course issues', async () => {
    const { id } = await course()
    const own = 'X-LC is what X-TWR issues, so it can’t also be a prerequisite.'

    expect(
      await refusal(
        payload.update({
          collection: 'courses',
          id,
          data: {
            prerequisites: [{ anyOf: [ground.id] }, { anyOf: [approach.id, local.id] }],
            credentialIssued: local.id,
          },
          ...as(lead),
        }),
      ),
    ).toEqual([{ path: 'prerequisites.1.anyOf', message: own }])

    await payload.update({
      collection: 'courses',
      id,
      data: { credentialIssued: local.id },
      ...as(lead),
    })
    // Naming it on a course that already issues it is refused too.
    expect(
      await refusal(
        payload.update({
          collection: 'courses',
          id,
          data: { prerequisites: [{ anyOf: [local.id] }] },
          ...as(lead),
        }),
      ),
    ).toEqual([{ path: 'prerequisites.0.anyOf', message: own }])

    const saved = await payload.update({
      collection: 'courses',
      id,
      data: { prerequisites: [{ anyOf: [ground.id] }] },
      depth: 0,
      ...as(lead),
    })
    expect(saved.credentialIssued).toBe(local.id)
  })

  it('are read by a course author, whose change to them is refused', async () => {
    const { id } = await course()
    await payload.update({
      collection: 'courses',
      id,
      data: { prerequisites: [{ anyOf: [ground.id] }], credentialIssued: local.id },
    })

    const read = await payload.findByID({ collection: 'courses', id, depth: 0, ...as(author) })
    expect(read.prerequisites?.map((row) => ids(row.anyOf))).toEqual([[ground.id]])
    expect(read.credentialIssued).toBe(local.id)

    for (const data of [
      { prerequisites: [] },
      { credentialIssued: null },
    ] satisfies Partial<Course>[]) {
      const change = payload.update({ collection: 'courses', id, data, ...as(author) })
      await expect(change).rejects.toBeInstanceOf(Forbidden)
    }
    const after = await payload.findByID({ collection: 'courses', id, depth: 0 })
    expect(after.prerequisites).toHaveLength(1)
    expect(after.credentialIssued).toBe(local.id)
  })

  it('leave out retired credentials not already named on the course', async () => {
    const { id } = await course()
    await payload.update({
      collection: 'courses',
      id,
      data: { prerequisites: [{ anyOf: [ground.id] }] },
    })
    await payload.update({ collection: 'credentials', id: ground.id, data: { retired: true } })
    await payload.update({ collection: 'credentials', id: approach.id, data: { retired: true } })

    const kept = await payload.update({
      collection: 'courses',
      id,
      data: { prerequisites: [{ anyOf: [ground.id] }, { anyOf: [local.id] }] },
      depth: 0,
      ...as(lead),
    })
    expect(kept.prerequisites).toHaveLength(2)

    expect(
      await refusal(
        payload.update({
          collection: 'courses',
          id,
          data: { prerequisites: [{ anyOf: [ground.id, approach.id] }] },
          ...as(lead),
        }),
      ),
    ).toEqual([{ path: 'prerequisites.0.anyOf', message: expect.any(String) }])
  })
})

describe('the credential a course issues', () => {
  it('is named by a lead, and saves on a course with no editions', async () => {
    const { id } = await course()

    const saved = await payload.update({
      collection: 'courses',
      id,
      data: { credentialIssued: local.id, prerequisites: [{ anyOf: [ground.id] }] },
      depth: 0,
      ...as(lead),
    })

    expect(saved.credentialIssued).toBe(local.id)
    const versions = await payload.find({
      collection: 'course-versions',
      where: { course: { equals: id } },
    })
    expect(versions.totalDocs).toBe(0)
  })

  it('is issued by one course only: naming it on another is refused, naming that course', async () => {
    const first = await course('X-TWR')
    await payload.update({
      collection: 'courses',
      id: first.id,
      data: { credentialIssued: local.id },
      ...as(lead),
    })
    const second = await course('X-APP')

    expect(
      await refusal(
        payload.update({
          collection: 'courses',
          id: second.id,
          data: { credentialIssued: local.id },
          ...as(lead),
        }),
      ),
    ).toEqual([
      {
        path: 'credentialIssued',
        message: 'X-TWR already issues X-LC. A credential is issued by one course only.',
      },
    ])
    expect(
      await refusal(
        payload.create({
          collection: 'courses',
          data: { code: 'X-CTR', title: 'Example Center', credentialIssued: local.id },
          ...as(lead),
        }),
      ),
    ).toEqual([
      {
        path: 'credentialIssued',
        message: 'X-TWR already issues X-LC. A credential is issued by one course only.',
      },
    ])

    // The course that issues it saves again unchanged.
    const again = await payload.update({
      collection: 'courses',
      id: first.id,
      data: { title: 'Example Tower again', credentialIssued: local.id },
      depth: 0,
      ...as(lead),
    })
    expect(again.credentialIssued).toBe(local.id)
  })

  it('leaves out a retired credential unless the course already issues it', async () => {
    const issuing = await course('X-TWR')
    await payload.update({
      collection: 'courses',
      id: issuing.id,
      data: { credentialIssued: local.id },
    })
    await payload.update({ collection: 'credentials', id: local.id, data: { retired: true } })
    await payload.update({ collection: 'credentials', id: ground.id, data: { retired: true } })

    const kept = await payload.update({
      collection: 'courses',
      id: issuing.id,
      data: { title: 'Example Tower again', credentialIssued: local.id },
      depth: 0,
      ...as(lead),
    })
    expect(kept.credentialIssued).toBe(local.id)

    const other = await course('X-APP')
    expect(
      await refusal(
        payload.update({
          collection: 'courses',
          id: other.id,
          data: { credentialIssued: ground.id },
          ...as(lead),
        }),
      ),
    ).toEqual([{ path: 'credentialIssued', message: expect.any(String) }])
  })
})

describe("the course document's prerequisites and credential issued", () => {
  async function draftOf(courseId: string) {
    await payload.create({
      collection: 'course-versions',
      data: { course: courseId, number: 1, status: 'draft' },
    })
  }

  it('are rows of credential codes and a code', async () => {
    const { id } = await course()
    const issued = await credential({ code: 'X-RC', kind: 'endorsement', name: 'Example Radar' })
    await payload.update({
      collection: 'courses',
      id,
      data: {
        prerequisites: [{ anyOf: [approach.id, ground.id] }, { anyOf: [local.id] }],
        credentialIssued: issued.id,
      },
    })
    await draftOf(id)

    const { body } = await callEndpoint(payload, '/courseware/courses/X-TWR/draft')

    expect(body.course.prerequisites).toEqual([{ anyOf: ['Y-GC', 'X-GC'] }, { anyOf: ['X-LC'] }])
    expect(body.course.credentialIssued).toBe('X-RC')
  })

  it('are an empty list and null when unset', async () => {
    const { id } = await course()
    await draftOf(id)

    const { body } = await callEndpoint(payload, '/courseware/courses/X-TWR/draft')

    expect(body.course.prerequisites).toEqual([])
    expect(body.course.credentialIssued).toBeNull()
  })

  it('still name a credential once it is retired', async () => {
    const { id } = await course()
    await payload.update({
      collection: 'courses',
      id,
      data: { prerequisites: [{ anyOf: [ground.id] }], credentialIssued: local.id },
    })
    await payload.update({ collection: 'credentials', id: ground.id, data: { retired: true } })
    await payload.update({ collection: 'credentials', id: local.id, data: { retired: true } })
    await draftOf(id)

    const { body } = await callEndpoint(payload, '/courseware/courses/X-TWR/draft')

    expect(body.course.prerequisites).toEqual([{ anyOf: ['X-GC'] }])
    expect(body.course.credentialIssued).toBe('X-LC')
  })
})
