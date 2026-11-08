import { ValidationError, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

let payload: Payload
let author: User

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  author = await payload.create({
    collection: 'users',
    data: { email: 'author@example.com', password: 'example-password', cid: '1000001' },
  })
})

const LINK_MESSAGE = 'A resource’s link must start with https://.'
const asAuthor = () => ({ user: author, overrideAccess: false, depth: 0 }) as const

/** A made-up course the author writes, with one lesson plan in a draft or published edition. */
async function lessonPlan(status: 'draft' | 'published') {
  const scale = await payload.create({
    collection: 'grading-scales',
    data: {
      name: 'Three point',
      points: [{ label: 'No' }, { label: 'Yes' }, { label: 'Very' }],
    },
  })
  const course = await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower', authors: [author.cid!] },
  })
  const version = await payload.create({
    collection: 'course-versions',
    data: {
      course: course.id,
      number: 1,
      status: 'draft',
      gradingScale: scale.id,
      defaultMinimum: 2,
    },
  })
  const task = await payload.create({
    collection: 'tasks',
    data: { name: 'Radio', knowledgeStatement: 'Know radio' },
  })
  const plan = await payload.create({
    collection: 'lesson-plans',
    depth: 0,
    data: {
      courseVersion: version.id,
      code: 'X-TWR-1',
      title: 'Radio',
      minimum: 2,
      tasks: [{ task: task.id }],
    },
  })
  await payload.update({
    collection: 'course-versions',
    id: version.id,
    data: { modules: [{ title: 'Tower', lessonPlans: [plan.id] }], status },
  })
  return { course, version, plan }
}

async function refusal(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) return error.data.errors.map((entry) => entry.message)
    throw error
  }
  throw new Error('Expected the save to be refused')
}

describe.each(['draft', 'published'] as const)(
  'lesson plan resources in a %s edition',
  (status) => {
    it('lets a course author add and change them', async () => {
      const { plan } = await lessonPlan(status)

      const added = await payload.update({
        collection: 'lesson-plans',
        id: plan.id,
        data: {
          resources: [
            { title: 'Chart', url: 'https://example.com/chart' },
            { title: 'Answers', url: 'https://example.com/answers', teacherOnly: true },
          ],
        },
        ...asAuthor(),
      })
      expect(
        added.resources?.map(({ title, url, teacherOnly }) => [title, url, teacherOnly]),
      ).toEqual([
        ['Chart', 'https://example.com/chart', false],
        ['Answers', 'https://example.com/answers', true],
      ])

      const changed = await payload.update({
        collection: 'lesson-plans',
        id: plan.id,
        data: { resources: [added.resources![1], { ...added.resources![0], title: 'Big chart' }] },
        ...asAuthor(),
      })
      expect(changed.resources?.map((resource) => resource.title)).toEqual(['Answers', 'Big chart'])
    })

    it('refuses a link that does not start with https://', async () => {
      const { plan } = await lessonPlan(status)
      for (const url of ['http://example.com/chart', 'example.com', 'ftp://example.com']) {
        expect(
          await refusal(
            payload.update({
              collection: 'lesson-plans',
              id: plan.id,
              data: { resources: [{ title: 'Chart', url }] },
              ...asAuthor(),
            }),
          ),
        ).toEqual([LINK_MESSAGE])
      }
      const after = await payload.findByID({ collection: 'lesson-plans', id: plan.id, depth: 0 })
      expect(after.resources).toEqual([])
    })
  },
)

it('serves them in order, teacher-only ones included', async () => {
  const { course, plan } = await lessonPlan('published')
  await payload.update({
    collection: 'lesson-plans',
    id: plan.id,
    data: {
      resources: [
        { title: 'Second to none', url: 'https://example.com/a', teacherOnly: true },
        { title: 'Chart', url: 'https://example.com/b' },
        { title: 'Video', url: 'https://example.com/c', teacherOnly: false },
      ],
    },
  })
  const { status, body } = await callEndpoint(payload, `/courseware/courses/${course.code}/current`)
  expect(status).toBe(200)
  const served = body.modules[0].lessonPlans[0].resources
  expect(served).toEqual([
    {
      id: expect.any(String),
      title: 'Second to none',
      url: 'https://example.com/a',
      teacherOnly: true,
    },
    { id: expect.any(String), title: 'Chart', url: 'https://example.com/b', teacherOnly: false },
    { id: expect.any(String), title: 'Video', url: 'https://example.com/c', teacherOnly: false },
  ])
})

it('is copied, in order, when a new edition is started', async () => {
  const { course, plan } = await lessonPlan('published')
  await payload.update({
    collection: 'lesson-plans',
    id: plan.id,
    data: {
      resources: [
        { title: 'Answers', url: 'https://example.com/a', teacherOnly: true },
        { title: 'Chart', url: 'https://example.com/b' },
      ],
    },
  })
  const admin = await payload.create({
    collection: 'users',
    data: {
      email: 'admin@example.com',
      password: 'example-password',
      cid: '1000000',
      roles: ['training:admin'],
    },
  })
  const started = await callEndpoint(payload, `/courseware/courses/${course.id}/editions`, {
    method: 'post',
    token: null,
    user: admin,
  })
  expect(started.status).toBe(201)
  const { docs } = await payload.find({
    collection: 'lesson-plans',
    where: { courseVersion: { equals: started.body.edition.id } },
    depth: 0,
  })
  expect(docs[0].resources?.map(({ title, teacherOnly }) => [title, teacherOnly])).toEqual([
    ['Answers', true],
    ['Chart', false],
  ])
})
