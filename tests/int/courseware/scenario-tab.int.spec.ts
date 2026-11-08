import { createLocalReq, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadOfferedBy, loadScenarioTab } from '@/components/admin/courses/scenarios'
import type { Course, User } from '@/payload-types'
import { resetDatabase, scenarioPositions, testPayload } from './helpers'

/**
 * The course page's Scenarios tab, as read for the signed-in person: the course's scenarios under
 * each lesson plan that offers them, in the draft if there is one and otherwise the live edition,
 * then those offered by none, then the retired ones; and a scenario's "Offered by".
 */

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

const asAuthor = () => createLocalReq({ user: { ...author, collection: 'users' } }, payload)

async function course(): Promise<Course> {
  return payload.create({
    collection: 'courses',
    data: { code: 'X-GC', title: 'Example Ground', authors: [author.cid!] },
  })
}

async function scenario(courseId: string, name: string, retired = false) {
  return payload.create({
    collection: 'scenarios',
    depth: 0,
    data: {
      course: courseId,
      name,
      airport: 'KXYZ',
      ...(await scenarioPositions(payload)),
      difficulty: 'medium',
      description: `About ${name}`,
      retired,
    },
  })
}

/**
 * An edition of `course` holding, in module order, X-GC-2 (offering `twice` and `retired`), then
 * X-GC-1 (offering `twice`), and X-GC-3 in no module (offering `third`).
 */
async function edition(
  courseId: string,
  number: number,
  status: 'draft' | 'published',
  offers: { twice: string; retired?: string; third?: string },
) {
  const version = await payload.create({
    collection: 'course-versions',
    depth: 0,
    data: { course: courseId, number, status: 'draft' },
  })
  const plan = (code: string, scenarios: string[]) =>
    payload.create({
      collection: 'lesson-plans',
      depth: 0,
      data: { courseVersion: version.id, code, title: `Plan ${code}`, scenarios },
    })
  const two = await plan('X-GC-2', [offers.twice, ...(offers.retired ? [offers.retired] : [])])
  const one = await plan('X-GC-1', [offers.twice])
  await plan('X-GC-3', offers.third ? [offers.third] : [])
  await payload.update({
    collection: 'course-versions',
    id: version.id,
    depth: 0,
    data: { modules: [{ title: 'Only', lessonPlans: [two.id, one.id] }] },
  })
  if (status === 'published') {
    await payload.update({
      collection: 'courses',
      id: courseId,
      data: { currentVersion: version.id },
    })
    await payload.db.updateOne({
      collection: 'course-versions',
      id: version.id,
      data: { status: 'published' },
    })
  }
  return version
}

const names = (rows: { name: string }[]) => rows.map((row) => row.name)

describe('the Scenarios tab', () => {
  it('groups scenarios under each lesson plan that offers them, in outline order, then none, then retired', async () => {
    const { id } = await course()
    const twice = await scenario(id, 'Twice offered')
    const third = await scenario(id, 'Offered in no module')
    await scenario(id, 'Nobody offers')
    const old = await scenario(id, 'Old setup', true)
    await edition(id, 1, 'draft', { twice: twice.id, retired: old.id, third: third.id })

    const tab = await loadScenarioTab(
      await asAuthor(),
      await payload.findByID({ collection: 'courses', id }),
    )

    expect(tab.edition).toEqual({ number: 1, status: 'draft' })
    expect(tab.offered.map((plan) => [plan.code, names(plan.scenarios)])).toEqual([
      ['X-GC-2', ['Twice offered', 'Old setup']],
      ['X-GC-1', ['Twice offered']],
      ['X-GC-3', ['Offered in no module']],
    ])
    expect(names(tab.offeredByNone)).toEqual(['Nobody offers'])
    expect(names(tab.retired)).toEqual(['Old setup'])
    expect(tab.offered[1].scenarios[0]).toEqual({
      id: twice.id,
      name: 'Twice offered',
      studentPosition: 'XYZ_GND',
      difficulty: 'Medium',
      description: 'About Twice offered',
      retired: false,
    })
  })

  it('reads the draft when there is one, and the live edition when there isn’t', async () => {
    const { id } = await course()
    const live = await scenario(id, 'In the live edition')
    const draft = await scenario(id, 'In the draft')
    await edition(id, 1, 'published', { twice: live.id })

    const fresh = await payload.findByID({ collection: 'courses', id })
    const onlyLive = await loadScenarioTab(await asAuthor(), fresh)
    expect(onlyLive.edition).toEqual({ number: 1, status: 'live' })
    expect(names(onlyLive.offered[0].scenarios)).toEqual(['In the live edition'])

    await edition(id, 2, 'draft', { twice: draft.id })
    const withDraft = await loadScenarioTab(await asAuthor(), fresh)
    expect(withDraft.edition).toEqual({ number: 2, status: 'draft' })
    expect(names(withDraft.offered[0].scenarios)).toEqual(['In the draft'])
    expect(names(withDraft.offeredByNone)).toEqual(['In the live edition'])
  })

  it('lists every scenario as offered by none, and the retired, for a course with no editions', async () => {
    const { id } = await course()
    await scenario(id, 'One')
    await scenario(id, 'Two')
    await scenario(id, 'Gone', true)

    const tab = await loadScenarioTab(
      await asAuthor(),
      await payload.findByID({ collection: 'courses', id }),
    )

    expect(tab).toEqual({
      edition: null,
      offered: [],
      offeredByNone: [
        expect.objectContaining({ name: 'One' }),
        expect.objectContaining({ name: 'Two' }),
      ],
      retired: [expect.objectContaining({ name: 'Gone' })],
    })
  })

  it('is read as the person signed in, so no one signed out sees it', async () => {
    const created = await course()

    await expect(loadScenarioTab(await createLocalReq({}, payload), created)).rejects.toThrow(
      'You are not allowed',
    )
  })
})

describe('a scenario’s “Offered by”', () => {
  it('names the lesson plans of the edition read that offer it', async () => {
    const { id } = await course()
    const twice = await scenario(id, 'Twice offered')
    const none = await scenario(id, 'Nobody offers')
    await edition(id, 1, 'draft', { twice: twice.id })

    expect(await loadOfferedBy(await asAuthor(), { id: twice.id, course: id })).toEqual({
      edition: { number: 1, status: 'draft' },
      plans: [
        { code: 'X-GC-2', title: 'Plan X-GC-2' },
        { code: 'X-GC-1', title: 'Plan X-GC-1' },
      ],
    })
    expect(await loadOfferedBy(await asAuthor(), { id: none.id, course: id })).toEqual({
      edition: { number: 1, status: 'draft' },
      plans: [],
    })
  })

  it('is read as the person signed in, so no one signed out gets it', async () => {
    const { id } = await course()
    const twice = await scenario(id, 'Twice offered')
    await edition(id, 1, 'draft', { twice: twice.id })

    await expect(
      loadOfferedBy(await createLocalReq({}, payload), { id: twice.id, course: id }),
    ).rejects.toThrow('You are not allowed')
  })
})
