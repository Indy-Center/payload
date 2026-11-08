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

  it('serves each task’s statements, empty when unset', async () => {
    await task('Radio', undefined, {
      knowledgeStatement: 'Phraseology',
      skillStatement: 'Speak it',
    })
    await task('Clearances')

    const { body } = await callEndpoint(payload, '/courseware/catalogue')

    expect(
      body.tasks.map((entry: Record<string, string>) => [
        entry.name,
        entry.knowledgeStatement,
        entry.skillStatement,
      ]),
    ).toEqual([
      ['Radio', 'Phraseology', 'Speak it'],
      ['Clearances', '', ''],
    ])
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

/** A task with both statements. */
const STATEMENTS = { knowledgeStatement: 'Know it', skillStatement: 'Do it' }

describe('lesson plan tasks', () => {
  it('expands a parent task into a row for each task beneath it, in that save', async () => {
    const version = await draftVersion()
    const radio = await task('Radio', undefined, STATEMENTS)
    const readbacks = await task('Readbacks', radio.id, STATEMENTS)
    const numbersTask = await task('Numbers', readbacks.id, STATEMENTS)
    const phraseology = await task('Phraseology', radio.id, STATEMENTS)
    await task('Old habit', radio.id, { retired: true })

    const plan = await payload.create({
      collection: 'lesson-plans',
      depth: 0,
      data: {
        courseVersion: version.id,
        tasks: [{ task: radio.id, required: false, teacherNotes: 'Ask what a readback is for' }],
      },
    })

    expect(plan.tasks?.map((row) => row.task)).toEqual([
      radio.id,
      readbacks.id,
      numbersTask.id,
      phraseology.id,
    ])
    expect(plan.tasks?.[0]).toMatchObject({
      required: false,
      teacherNotes: 'Ask what a readback is for',
    })
    // The rows it added are required, as any new row is.
    expect(plan.tasks?.slice(1).map((row) => row.required)).toEqual([true, true, true])
  })

  it('keeps rows the author removed or reordered after expanding', async () => {
    const version = await draftVersion()
    const radio = await task('Radio', undefined, STATEMENTS)
    await task('Readbacks', radio.id, STATEMENTS)
    const phraseology = await task('Phraseology', radio.id, STATEMENTS)
    const plan = await payload.create({
      collection: 'lesson-plans',
      depth: 0,
      data: { courseVersion: version.id, tasks: [{ task: radio.id }] },
    })

    const rows = plan.tasks ?? []
    const updated = await payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      depth: 0,
      data: { tasks: [rows[2], rows[0]] },
    })

    expect(updated.tasks?.map((row) => row.task)).toEqual([phraseology.id, radio.id])
  })

  it('does not change a saved lesson plan when a task is added to the tree later', async () => {
    const version = await draftVersion()
    const radio = await task('Radio', undefined, STATEMENTS)
    await task('Readbacks', radio.id, STATEMENTS)
    const plan = await payload.create({
      collection: 'lesson-plans',
      data: { courseVersion: version.id, tasks: [{ task: radio.id }] },
    })

    await task('Phraseology', radio.id, STATEMENTS)
    const resaved = await payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      data: { title: 'Radio work' },
    })

    expect(resaved.tasks).toHaveLength(2)
  })

  it('refuses a retired task as a new row', async () => {
    const version = await draftVersion()
    const retired = await task('Old habit', undefined, { ...STATEMENTS, retired: true })

    await expect(
      payload.create({
        collection: 'lesson-plans',
        data: { courseVersion: version.id, tasks: [{ task: retired.id }] },
      }),
    ).rejects.toThrow('tasks.0.task')
  })

  it('serves its tasks in order with their task numbers, required, statements and teacher notes', async () => {
    const version = await draftVersion()
    const radio = await task('Radio', undefined, STATEMENTS)
    const clearances = await task('Clearances', undefined, { skillStatement: 'Issue one' })
    const plan = await payload.create({
      collection: 'lesson-plans',
      data: {
        courseVersion: version.id,
        tasks: [
          { task: clearances.id, teacherNotes: 'Have them read one back' },
          { task: radio.id, required: false },
        ],
      },
    })
    await payload.update({
      collection: 'course-versions',
      id: version.id,
      data: { modules: [{ title: 'Tower', lessonPlans: [plan.id] }] },
    })

    const { body } = await callEndpoint(payload, '/courseware/courses/X-TWR/draft')

    const served = body.modules[0].lessonPlans[0]
    expect(served).not.toHaveProperty('theoryItems')
    expect(served.tasks).toEqual([
      {
        id: expect.any(String),
        task: { id: clearances.id, number: '2', name: 'Clearances' },
        required: true,
        // A statement the task lacks is served empty.
        statements: { knowledge: '', skill: 'Issue one' },
        teacherNotes: 'Have them read one back',
      },
      {
        id: expect.any(String),
        task: { id: radio.id, number: '1', name: 'Radio' },
        required: false,
        statements: { knowledge: 'Know it', skill: 'Do it' },
        teacherNotes: '',
      },
    ])
  })
})
