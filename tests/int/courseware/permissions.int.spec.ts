import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import { resetCourseware, testPayload } from './helpers'

let payload: Payload
let admin: User
let lead: User
let author: User
let otherAuthor: User

beforeAll(async () => {
  payload = await testPayload()
})

async function account(email: string, cid: string, roles: User['roles'] = []): Promise<User> {
  return payload.create({
    collection: 'users',
    data: { email, password: 'example-password', cid, roles },
  })
}

/** Two made-up courses, each with a draft and an author. */
async function courses() {
  const own = await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower', authors: [author.cid!] },
  })
  const other = await payload.create({
    collection: 'courses',
    data: { code: 'X-APP', title: 'Example Approach', authors: [otherAuthor.cid!] },
  })
  const ownDraft = await payload.create({
    collection: 'course-versions',
    data: { course: own.id, number: 1, status: 'draft' },
  })
  const otherDraft = await payload.create({
    collection: 'course-versions',
    data: { course: other.id, number: 1, status: 'draft' },
  })
  const task = await payload.create({ collection: 'tasks', data: { name: 'Radio' } })
  return { own, other, ownDraft, otherDraft, task }
}

const as = (user: User) => ({ user, overrideAccess: false })

beforeEach(async () => {
  await resetCourseware(payload)
  admin = await account('admin@example.com', '1000000', ['training:admin'])
  lead = await account('lead@example.com', '1000009', ['training:lead'])
  author = await account('author@example.com', '1000001')
  otherAuthor = await account('other@example.com', '1000002')
})

describe('the task list', () => {
  it('is created, edited and retired by the Training Admin and leads only', async () => {
    for (const user of [admin, lead]) {
      const task = await payload.create({
        collection: 'tasks',
        data: { name: 'Radio' },
        ...as(user),
      })
      await payload.update({
        collection: 'tasks',
        id: task.id,
        data: { retired: true },
        ...as(user),
      })
    }

    await expect(
      payload.create({ collection: 'tasks', data: { name: 'Radio' }, ...as(author) }),
    ).rejects.toThrow()
    const existing = await payload.create({ collection: 'tasks', data: { name: 'Radio' } })
    await expect(
      payload.update({
        collection: 'tasks',
        id: existing.id,
        data: { name: 'Renamed' },
        ...as(author),
      }),
    ).rejects.toThrow()
  })
})

describe('a course author', () => {
  it('edits their own course’s drafts, lesson plans and scenarios', async () => {
    const { own, ownDraft, task } = await courses()

    await payload.update({
      collection: 'course-versions',
      id: ownDraft.id,
      data: { description: 'Edited by the author' },
      ...as(author),
    })
    const plan = await payload.create({
      collection: 'lesson-plans',
      data: {
        courseVersion: ownDraft.id,
        title: 'Radio',
        theoryItems: [{ task: task.id, teacherNotes: 'Ask about readbacks' }],
      },
      ...as(author),
    })
    await payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      data: { title: 'Radio work' },
      ...as(author),
    })
    const scenario = await payload.create({
      collection: 'scenarios',
      data: { course: own.id, name: 'Quiet', airport: 'KXYZ', position: 'XYZ_TWR', mode: 'sim' },
      ...as(author),
    })

    expect(scenario.course).toMatchObject({ id: own.id })
  })

  it('cannot touch another course', async () => {
    const { other, otherDraft } = await courses()
    const plan = await payload.create({
      collection: 'lesson-plans',
      data: { courseVersion: otherDraft.id, title: 'Theirs' },
    })

    await expect(
      payload.update({
        collection: 'course-versions',
        id: otherDraft.id,
        data: { description: 'Not mine' },
        ...as(author),
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({
        collection: 'lesson-plans',
        id: plan.id,
        data: { title: 'Not mine' },
        ...as(author),
      }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'lesson-plans',
        data: { courseVersion: otherDraft.id, title: 'Not mine' },
        ...as(author),
      }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'scenarios',
        data: {
          course: other.id,
          name: 'Not mine',
          airport: 'KXYZ',
          position: 'XYZ_APP',
          mode: 'sim',
        },
        ...as(author),
      }),
    ).rejects.toThrow()
  })

  it('cannot change who authors a course', async () => {
    const { own } = await courses()
    await expect(
      payload.update({
        collection: 'courses',
        id: own.id,
        data: { authors: [author.cid!, '1000003'] },
        ...as(author),
      }),
    ).rejects.toThrow()
  })

  it('cannot publish, nor edit a published version', async () => {
    const { ownDraft } = await courses()

    await payload.update({
      collection: 'course-versions',
      id: ownDraft.id,
      data: { status: 'published' },
      ...as(author),
    })
    expect(
      (await payload.findByID({ collection: 'course-versions', id: ownDraft.id })).status,
    ).toBe('draft')

    await payload.db.updateOne({
      collection: 'course-versions',
      id: ownDraft.id,
      data: { status: 'published' },
    })
    await expect(
      payload.update({
        collection: 'course-versions',
        id: ownDraft.id,
        data: { description: 'After publishing' },
        ...as(author),
      }),
    ).rejects.toThrow()
  })

  it('cannot retire a scenario', async () => {
    const { own } = await courses()
    const scenario = await payload.create({
      collection: 'scenarios',
      data: { course: own.id, name: 'Quiet', airport: 'KXYZ', position: 'XYZ_TWR', mode: 'sim' },
    })

    await payload.update({
      collection: 'scenarios',
      id: scenario.id,
      data: { retired: true },
      ...as(author),
    })

    expect((await payload.findByID({ collection: 'scenarios', id: scenario.id })).retired).toBe(
      false,
    )
  })

  it('cannot manage CMS accounts', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: { email: 'new@example.com', password: 'example-password' },
        ...as(author),
      }),
    ).rejects.toThrow()
  })
})

describe('the Training Admin and leads', () => {
  it('publish', async () => {
    const { ownDraft } = await courses()
    const scale = await payload.create({
      collection: 'grading-scales',
      data: {
        name: 'Two point',
        points: [{ label: 'No' }, { label: 'Yes' }],
      },
      ...as(lead),
    })
    const plan = await payload.create({
      collection: 'lesson-plans',
      data: { courseVersion: ownDraft.id, code: 'X-TWR-1', title: 'Radio', minimum: 2 },
    })
    const task = await payload.create({ collection: 'tasks', data: { name: 'Readbacks' } })
    await payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      data: { theoryItems: [{ task: task.id }] },
    })

    const published = await payload.update({
      collection: 'course-versions',
      id: ownDraft.id,
      data: {
        gradingScale: scale.id,
        defaultMinimum: 2,
        modules: [{ title: 'Tower', lessonPlans: [plan.id] }],
        status: 'published',
      },
      ...as(lead),
    })

    expect(published.status).toBe('published')
  })

  it('manage CMS accounts; only the Training Admin gives roles', async () => {
    const created = await payload.create({
      collection: 'users',
      data: { email: 'new@example.com', password: 'example-password', cid: '1000004' },
      ...as(lead),
    })
    await payload.update({
      collection: 'users',
      id: created.id,
      data: { roles: ['training:lead'] },
      ...as(lead),
    })
    expect((await payload.findByID({ collection: 'users', id: created.id })).roles).toEqual([])

    await payload.update({
      collection: 'users',
      id: created.id,
      data: { roles: ['training:lead'] },
      ...as(admin),
    })
    expect((await payload.findByID({ collection: 'users', id: created.id })).roles).toEqual([
      'training:lead',
    ])
  })
})
