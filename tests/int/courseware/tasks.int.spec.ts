import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
})

async function task(name: string, parent?: string, extra: Record<string, unknown> = {}) {
  return payload.create({ collection: 'tasks', data: { name, parent, ...extra } })
}

async function numbers(): Promise<Record<string, string>> {
  const { body } = await callEndpoint(payload, '/courseware/catalogue')
  return Object.fromEntries(
    body.tasks.map((entry: { name: string; number: string }) => [entry.name, entry.number]),
  )
}

async function draftVersion() {
  const course = await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower' },
  })
  return payload.create({
    collection: 'course-versions',
    data: { course: course.id, number: 1, status: 'draft' },
  })
}

describe('the task tree', () => {
  it('numbers each task from its place in the tree', async () => {
    const radio = await task('Radio')
    await task('Clearances')
    await task('Readbacks', radio.id)
    await task('Phraseology', radio.id)

    expect(await numbers()).toEqual({
      Radio: '1',
      Readbacks: '1.1',
      Phraseology: '1.2',
      Clearances: '2',
    })
  })

  it('lists the catalogue in tree order', async () => {
    const radio = await task('Radio')
    await task('Clearances')
    await task('Readbacks', radio.id)

    const { body } = await callEndpoint(payload, '/courseware/catalogue')

    expect(body.tasks.map((entry: { name: string }) => entry.name)).toEqual([
      'Radio',
      'Readbacks',
      'Clearances',
    ])
    expect(body.tasks[1]).toMatchObject({ parentId: radio.id, retired: false })
  })

  it('renumbers later siblings when a task is moved in between, with no other edit', async () => {
    const user = await payload.create({
      collection: 'users',
      data: { email: 'lead@example.com', password: 'example-password', roles: ['training:lead'] },
    })
    const radio = await task('Radio')
    const first = await task('Readbacks', radio.id)
    await task('Phraseology', radio.id)
    const inserted = await task('Frequencies', radio.id)

    const { status } = await callEndpoint(payload, '/reorder', {
      method: 'post',
      user,
      body: {
        collectionSlug: 'tasks',
        docsToMove: [inserted.id],
        newKeyWillBe: 'greater',
        orderableFieldName: '_order',
        target: { id: first.id, key: first._order },
      },
    })

    expect(status).toBe(200)
    expect(await numbers()).toMatchObject({
      Readbacks: '1.1',
      Frequencies: '1.2',
      Phraseology: '1.3',
    })
  })

  it('retires tasks rather than deleting them', async () => {
    const user = await payload.create({
      collection: 'users',
      data: { email: 'lead@example.com', password: 'example-password', roles: ['training:lead'] },
    })
    const radio = await task('Radio')

    await expect(
      payload.delete({ collection: 'tasks', id: radio.id, overrideAccess: false, user }),
    ).rejects.toThrow()
    await payload.update({ collection: 'tasks', id: radio.id, data: { retired: true } })

    const { body } = await callEndpoint(payload, '/courseware/catalogue')
    expect(body.tasks[0]).toMatchObject({ name: 'Radio', retired: true })
  })
})

describe('theory items', () => {
  it('expands a parent task into a row for each task beneath it, in that save', async () => {
    const version = await draftVersion()
    const radio = await task('Radio')
    const readbacks = await task('Readbacks', radio.id)
    const numbersTask = await task('Numbers', readbacks.id)
    const phraseology = await task('Phraseology', radio.id)
    await task('Old habit', radio.id, { retired: true })

    const plan = await payload.create({
      collection: 'lesson-plans',
      depth: 0,
      data: {
        courseVersion: version.id,
        theoryItems: [{ task: radio.id, teacherNotes: 'Ask what a readback is for' }],
      },
    })

    expect(plan.theoryItems?.map((item) => item.task)).toEqual([
      radio.id,
      readbacks.id,
      numbersTask.id,
      phraseology.id,
    ])
    expect(plan.theoryItems?.[0].teacherNotes).toBe('Ask what a readback is for')
  })

  it('keeps rows the author removed or reordered after expanding', async () => {
    const version = await draftVersion()
    const radio = await task('Radio')
    await task('Readbacks', radio.id)
    const phraseology = await task('Phraseology', radio.id)
    const plan = await payload.create({
      collection: 'lesson-plans',
      depth: 0,
      data: { courseVersion: version.id, theoryItems: [{ task: radio.id }] },
    })

    const rows = plan.theoryItems ?? []
    const updated = await payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      depth: 0,
      data: { theoryItems: [rows[2], rows[0]] },
    })

    expect(updated.theoryItems?.map((item) => item.task)).toEqual([phraseology.id, radio.id])
  })

  it('does not change a saved lesson plan when a task is added to the tree later', async () => {
    const version = await draftVersion()
    const radio = await task('Radio')
    await task('Readbacks', radio.id)
    const plan = await payload.create({
      collection: 'lesson-plans',
      data: { courseVersion: version.id, theoryItems: [{ task: radio.id }] },
    })

    await task('Phraseology', radio.id)
    const resaved = await payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      data: { title: 'Radio work' },
    })

    expect(resaved.theoryItems).toHaveLength(2)
  })

  it('refuses a retired task as a new theory item', async () => {
    const version = await draftVersion()
    const retired = await task('Old habit', undefined, { retired: true })

    await expect(
      payload.create({
        collection: 'lesson-plans',
        data: { courseVersion: version.id, theoryItems: [{ task: retired.id }] },
      }),
    ).rejects.toThrow()
  })

  it('serves theory items in order with their task numbers and teacher notes', async () => {
    const version = await draftVersion()
    const radio = await task('Radio')
    const clearances = await task('Clearances')
    const plan = await payload.create({
      collection: 'lesson-plans',
      data: {
        courseVersion: version.id,
        theoryItems: [
          { task: clearances.id, teacherNotes: 'Have them read one back' },
          { task: radio.id },
        ],
      },
    })
    await payload.update({
      collection: 'course-versions',
      id: version.id,
      data: { modules: [{ title: 'Tower', lessonPlans: [plan.id] }] },
    })

    const { body } = await callEndpoint(payload, '/courseware/courses/X-TWR/draft')

    expect(body.modules[0].lessonPlans[0].theoryItems).toEqual([
      {
        id: expect.any(String),
        task: { id: clearances.id, number: '2', name: 'Clearances' },
        teacherNotes: 'Have them read one back',
      },
      {
        id: expect.any(String),
        task: { id: radio.id, number: '1', name: 'Radio' },
        teacherNotes: '',
      },
    ])
  })
})
