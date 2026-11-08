import { createLocalReq, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { LessonPlanGridRow } from '@/courseware/lesson-plan-grid'
import { loadLessonPlanGrid } from '@/courseware/lesson-plan-grid-save'
import type { LessonPlan, Task, User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

/**
 * A lesson plan's "Edit as grid" tab (decisions 0065, 0055): what it starts from, and its Save,
 * which writes every row in one save of the lesson plan as the signed-in person, all or nothing,
 * through the lesson plan's own rules. Driven through its endpoint.
 */

let payload: Payload
let lead: User
let author: User
let stranger: User

const PLAN_STRUCTURE =
  'This lesson plan is in a published edition, so changing its tasks, their order, whether each is required or what it grades, its minimum, the scenarios it offers or its edition is a structural change, which needs the Training Admin or a lead. Its wording and teacher notes can still change.'

beforeAll(async () => {
  payload = await testPayload()
})

async function account(email: string, cid: string, roles: User['roles'] = []): Promise<User> {
  return payload.create({
    collection: 'users',
    data: { email, password: 'example-password', cid, roles },
  })
}

type Tree = Record<'radio' | 'readbacks' | 'numbers' | 'ground' | 'weather', Task>
let t: Tree
let plan: LessonPlan
let versionId: string

beforeEach(async () => {
  await resetDatabase(payload)
  lead = await account('lead@example.com', '1000009', ['training:lead'])
  author = await account('author@example.com', '1000001')
  stranger = await account('stranger@example.com', '1000002')
  const task = (name: string, data: Record<string, unknown> = {}) =>
    payload.create({ collection: 'tasks', data: { name, ...data } })
  // 1 Radio > 1.1 Readbacks > 1.1.1 Numbers; 2 Ground; 3 Weather, retired.
  const radio = await task('Radio', { knowledgeStatement: 'Know radio', skillStatement: 'Use it' })
  const readbacks = await task('Readbacks', { parent: radio.id, knowledgeStatement: 'Know them' })
  const numbers = await task('Numbers', { parent: readbacks.id, skillStatement: 'Say them' })
  const ground = await task('Ground', { knowledgeStatement: 'Know ground', skillStatement: 'Taxi' })
  const weather = await task('Weather', { skillStatement: 'Read it' })
  await payload.update({ collection: 'tasks', id: weather.id, data: { retired: true } })
  t = { radio, readbacks, numbers, ground, weather }

  const scale = await payload.create({
    collection: 'grading-scales',
    data: { name: 'Two point', points: [{ label: 'Not yet' }, { label: 'Yes' }] },
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
  versionId = version.id
  plan = await payload.create({
    collection: 'lesson-plans',
    depth: 0,
    data: {
      courseVersion: version.id,
      code: 'X-TWR-1',
      title: 'Radio',
      minimum: 2,
      tasks: [
        { task: ground.id, teacherNotes: 'Ask about taxiways' },
        { task: numbers.id, required: false },
      ],
    },
  })
  await payload.update({
    collection: 'course-versions',
    id: version.id,
    data: { modules: [{ title: 'Tower', lessonPlans: [plan.id] }] },
  })
})

/** The saved rows as the grid sends them back unchanged, keyed by their own ids. */
const asSent = (rows: LessonPlan['tasks']): LessonPlanGridRow[] =>
  (rows ?? []).map((row) => ({
    key: row.id!,
    id: row.id!,
    task: row.task as string,
    required: row.required !== false,
    gradesKnowledge: row.gradesKnowledge === true,
    gradesSkill: row.gradesSkill === true,
    teacherNotes: row.teacherNotes ?? '',
  }))

const save = (rows: LessonPlanGridRow[], user: User | null = lead, id = plan.id) =>
  callEndpoint(payload, `/courseware/lesson-plans/${id}/tasks`, {
    method: 'post',
    token: null,
    body: { rows },
    ...(user ? { user } : {}),
  })

/** The lesson plan's rows as "task required K S notes". */
async function rowsNow(id = plan.id) {
  const after = await payload.findByID({ collection: 'lesson-plans', id, depth: 1 })
  return (after.tasks ?? []).map(
    (row) =>
      `${(row.task as Task).name}${row.required ? ' required' : ''}${row.gradesKnowledge ? ' K' : ''}${row.gradesSkill ? ' S' : ''}${row.teacherNotes ? ` (${row.teacherNotes})` : ''}`,
  )
}

const STALE_PLAN =
  'Someone else saved this lesson plan since the grid was opened. Reload it and make your changes again.'

describe('saving a lesson plan’s grid from the copy it opened', () => {
  const saveFrom = (updatedAt: string, rows: LessonPlanGridRow[]) =>
    callEndpoint(payload, `/courseware/lesson-plans/${plan.id}/tasks`, {
      method: 'post',
      token: null,
      body: { updatedAt, rows },
      user: lead,
    })

  it('is refused whole, writing nothing, once the lesson plan has been saved since', async () => {
    const [ground, numbers] = asSent(plan.tasks)
    await payload.update({ collection: 'lesson-plans', id: plan.id, data: { title: 'Radio work' } })

    const { status, body } = await saveFrom(plan.updatedAt, [
      { ...numbers, teacherNotes: 'Count' },
      ground,
    ])

    expect(status).toBe(409)
    expect(body.errors).toEqual([{ message: STALE_PLAN }])
    expect(await rowsNow()).toEqual(['Ground required K S (Ask about taxiways)', 'Numbers S'])
  })

  it('answers the new updatedAt, from which a second Save lands', async () => {
    const [ground, numbers] = asSent(plan.tasks)

    const first = await saveFrom(plan.updatedAt, [ground, { ...numbers, teacherNotes: 'Count' }])
    expect(first.status).toBe(200)
    const second = await saveFrom(first.body.saved.updatedAt, [
      ground,
      { ...numbers, teacherNotes: 'Count twice' },
    ])

    expect(second.status).toBe(200)
    expect(await rowsNow()).toEqual([
      'Ground required K S (Ask about taxiways)',
      'Numbers S (Count twice)',
    ])
  })

  it('is refused as stale before any other rule', async () => {
    const [ground] = asSent(plan.tasks)
    await payload.update({ collection: 'lesson-plans', id: plan.id, data: { title: 'Radio work' } })

    // A retired task's row would be refused too.
    const { body } = await saveFrom(plan.updatedAt, [
      ground,
      {
        key: 'new:1',
        task: t.weather.id,
        required: true,
        gradesKnowledge: false,
        gradesSkill: true,
        teacherNotes: '',
      },
    ])

    expect(body.errors).toEqual([{ message: STALE_PLAN }])
  })
})

describe('saving a lesson plan’s grid', () => {
  it('saves every row in its new order: edits, removals and added rows together', async () => {
    const [ground] = asSent(plan.tasks)

    // Numbers is removed; Radio and Readbacks are added either side of Ground.
    const { status } = await save([
      {
        key: 'new:1',
        task: t.radio.id,
        required: true,
        gradesKnowledge: true,
        gradesSkill: false,
        teacherNotes: '',
      },
      { ...ground, required: false, gradesSkill: false, teacherNotes: 'Ask about hold short' },
      {
        key: 'new:2',
        task: t.readbacks.id,
        required: true,
        gradesKnowledge: true,
        gradesSkill: false,
        teacherNotes: 'Count',
      },
    ])

    expect(status).toBe(200)
    expect(await rowsNow()).toEqual([
      'Radio required K',
      'Ground K (Ask about hold short)',
      'Readbacks required K (Count)',
    ])
  })

  it('keeps the rows as sent: a parent added without one of its children gets no row for it', async () => {
    const rows = asSent(plan.tasks)

    // From the picker: Radio ticked with what is beneath it, then Readbacks unticked.
    const { status } = await save([
      ...rows,
      {
        key: 'new:1',
        task: t.radio.id,
        required: true,
        gradesKnowledge: true,
        gradesSkill: true,
        teacherNotes: '',
      },
    ])

    expect(status).toBe(200)
    expect(await rowsNow()).toEqual([
      'Ground required K S (Ask about taxiways)',
      'Numbers S',
      'Radio required K S',
    ])
  })

  it('refuses all of it when one row breaks a rule, naming the row', async () => {
    const before = await rowsNow()
    const [ground, numbers] = asSent(plan.tasks)

    const { status, body } = await save([
      { ...ground, teacherNotes: 'Changed' },
      { ...numbers, gradesKnowledge: true },
      {
        key: 'new:1',
        task: t.readbacks.id,
        required: true,
        gradesKnowledge: false,
        gradesSkill: false,
        teacherNotes: '',
      },
    ])

    expect(status).toBe(400)
    expect(body.errors).toEqual([
      { row: numbers.key, message: 'Task 1.1.1 has no knowledge statement to grade.' },
      { row: 'new:1', message: 'Pick knowledge, skill or both to grade on task 1.1.' },
    ])
    expect(await rowsNow()).toEqual(before)
  })

  it('refuses a retired task in an added row', async () => {
    const { status, body } = await save([
      ...asSent(plan.tasks),
      {
        key: 'new:1',
        task: t.weather.id,
        required: true,
        gradesKnowledge: false,
        gradesSkill: true,
        teacherNotes: '',
      },
    ])

    expect(status).toBe(400)
    expect(body.errors).toEqual([{ row: 'new:1', message: 'This task is retired.' }])
  })

  it('lets a course author change anything on a draft', async () => {
    const [ground, numbers] = asSent(plan.tasks)

    const { status } = await save([{ ...numbers, required: true }, ground], author)

    expect(status).toBe(200)
    expect(await rowsNow()).toEqual([
      'Numbers required S',
      'Ground required K S (Ask about taxiways)',
    ])
  })

  it('refuses anyone not signed in, and an account that may not edit the lesson plan', async () => {
    const rows = asSent(plan.tasks).reverse()

    expect((await save(rows, null)).status).toBe(401)
    const { status, body } = await save(rows, stranger)
    expect(status).toBe(403)
    expect(body.errors).toEqual([{ message: 'You are not allowed to perform this action.' }])
    const missing = '00000000-0000-7000-8000-000000000000'
    expect((await save(rows, lead, missing)).status).toBe(404)
  })

  describe('in a published edition', () => {
    beforeEach(async () => {
      await payload.update({
        collection: 'course-versions',
        id: versionId,
        data: { status: 'published' },
      })
    })

    it('refuses a course author’s structural change with the structure message', async () => {
      const [ground, numbers] = asSent(plan.tasks)

      for (const rows of [
        [numbers, ground],
        [ground],
        [{ ...ground, required: false }, numbers],
        [{ ...ground, gradesSkill: false }, numbers],
        [
          ground,
          numbers,
          {
            key: 'new:1',
            task: t.radio.id,
            required: true,
            gradesKnowledge: true,
            gradesSkill: true,
            teacherNotes: '',
          },
        ],
      ]) {
        const { status, body } = await save(rows, author)
        expect(status).toBe(400)
        expect(body.errors).toEqual([{ message: PLAN_STRUCTURE }])
      }
    })

    it('takes a course author’s teacher notes, and a lead’s structural change', async () => {
      const [ground, numbers] = asSent(plan.tasks)

      expect((await save([ground, { ...numbers, teacherNotes: 'New' }], author)).status).toBe(200)
      expect(await rowsNow()).toEqual([
        'Ground required K S (Ask about taxiways)',
        'Numbers S (New)',
      ])

      expect((await save([{ ...numbers, teacherNotes: 'New' }], lead)).status).toBe(200)
      expect(await rowsNow()).toEqual(['Numbers S (New)'])
    })
  })
})

describe('what the grid starts from', () => {
  const load = async (user: User) =>
    loadLessonPlanGrid(
      await createLocalReq({ user: { ...user, collection: 'users' } }, payload),
      plan.id,
    )

  it('lists the rows with their task’s number and statements, and offers live tasks only', async () => {
    const grid = await load(lead)

    expect(
      grid.rows.map(({ number, name, hasKnowledge, hasSkill, required }) => ({
        number,
        name,
        hasKnowledge,
        hasSkill,
        required,
      })),
    ).toEqual([
      { number: '2', name: 'Ground', hasKnowledge: true, hasSkill: true, required: true },
      { number: '1.1.1', name: 'Numbers', hasKnowledge: false, hasSkill: true, required: false },
    ])
    expect(grid.picker.map((task) => `${task.number} ${task.name}`)).toEqual([
      '1 Radio',
      '1.1 Readbacks',
      '1.1.1 Numbers',
      '2 Ground',
    ])
    expect(grid).toMatchObject({ mayEdit: true, mayChangeStructure: true })
  })

  it('leaves a course author only teacher notes in a published edition', async () => {
    expect(await load(author)).toMatchObject({ mayEdit: true, mayChangeStructure: true })
    expect(await load(stranger)).toMatchObject({ mayEdit: false })

    await payload.update({
      collection: 'course-versions',
      id: versionId,
      data: { status: 'published' },
    })

    expect(await load(author)).toMatchObject({ mayEdit: true, mayChangeStructure: false })
    expect(await load(lead)).toMatchObject({ mayEdit: true, mayChangeStructure: true })
  })

  it('is read as the person signed in, so no one signed out gets it', async () => {
    await expect(loadLessonPlanGrid(await createLocalReq({}, payload), plan.id)).rejects.toThrow(
      'You are not allowed to perform this action.',
    )
  })
})
