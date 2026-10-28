import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import {
  rowLabel,
  SINGULAR,
  type RowLabelKind,
  type RowLabelLookup,
} from '@/courseware/row-label-text'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

const lookup: RowLabelLookup = {
  competencies: { c1: { framework: 'USA', edition: '2026-10', sourceId: '2.2.2a', title: 'Taxi' } },
  sources: {
    s1: { name: 'JO 7110.65BB', edition: null },
    s2: { name: 'KIND SOP', edition: '2026-03' },
  },
  tasks: { t1: { number: '2.2.1', name: 'Airport layout' } },
  credentials: { k1: 'S-GC', k2: 'A-GC' },
}

describe('what a row says', () => {
  it('names a mapping by framework, edition, competency ID and title', () => {
    expect(rowLabel('mapping', { competency: 'c1' }, lookup)?.text).toBe(
      'USA 2026-10 · 2.2.2a Taxi',
    )
  })

  it('names a citation by source, place and, when there is one, title', () => {
    expect(rowLabel('citation', { source: 's1', place: '3-7-2' }, lookup)?.text).toBe(
      'JO 7110.65BB 3-7-2',
    )
    expect(rowLabel('citation', { source: 's2', place: '4-2.b' }, lookup)?.text).toBe(
      'KIND SOP 2026-03 4-2.b',
    )
    expect(
      rowLabel('citation', { source: 's1', place: '3-7-2', title: ' Taxi ' }, lookup)?.text,
    ).toBe('JO 7110.65BB 3-7-2 · Taxi')
    expect(
      rowLabel(
        'citation',
        { source: 's1', place: '3-7-2', title: 'Taxi and ground movement operations' },
        lookup,
      )?.text,
    ).toBe('JO 7110.65BB 3-7-2 · Taxi and ground movement operations')
    expect(rowLabel('citation', { source: 's1' }, lookup)?.text).toBe('JO 7110.65BB')
  })

  it('names points and modules by their own words', () => {
    expect(rowLabel('point', { label: 'Satisfactory' }, null)?.text).toBe('Satisfactory')
    expect(rowLabel('module', { title: 'Ground control' }, null)?.text).toBe('Ground control')
  })

  it('names theory items and practical tasks by task number and name', () => {
    expect(rowLabel('theoryItem', { task: 't1' }, lookup)?.text).toBe('2.2.1 Airport layout')
    expect(rowLabel('practicalTask', { task: 't1', required: true }, lookup)).toEqual({
      text: '2.2.1 Airport layout',
      tag: 'Required',
    })
    expect(rowLabel('practicalTask', { task: 't1', required: false }, lookup)).toEqual({
      text: '2.2.1 Airport layout',
    })
    expect(rowLabel('theoryItem', { task: { id: 't1' } }, lookup)?.text).toBe(
      '2.2.1 Airport layout',
    )
  })

  it('names a prerequisite by its credential codes', () => {
    expect(rowLabel('prerequisite', { anyOf: ['k1', 'k2'] }, lookup)?.text).toBe(
      'Holds one of: S-GC, A-GC',
    )
  })

  it('says nothing for an empty row or before the lookup arrives', () => {
    expect(rowLabel('mapping', {}, lookup)).toBeNull()
    expect(rowLabel('mapping', { competency: 'c1' }, null)).toBeNull()
    expect(rowLabel('citation', { place: '3-7-2' }, lookup)).toBeNull()
    expect(rowLabel('point', { label: '  ' }, null)).toBeNull()
    expect(rowLabel('module', {}, null)).toBeNull()
    expect(rowLabel('theoryItem', { task: 'gone' }, lookup)).toBeNull()
    expect(rowLabel('prerequisite', { anyOf: [] }, lookup)).toBeNull()
  })
})

describe('the label of an empty row', () => {
  const arrays: Record<RowLabelKind, [collection: string, field: string]> = {
    mapping: ['tasks', 'mappings'],
    citation: ['tasks', 'citations'],
    point: ['grading-scales', 'points'],
    module: ['course-versions', 'modules'],
    theoryItem: ['lesson-plans', 'theoryItems'],
    practicalTask: ['scenarios', 'practicalTasks'],
    prerequisite: ['courses', 'prerequisites'],
  }

  it.each(Object.entries(arrays) as [RowLabelKind, [string, string]][])(
    'matches Payload’s own wording for a %s row',
    async (kind, [collection, field]) => {
      const payload = await testPayload()
      // Flattened, so an array laid out inside a row or an unnamed group is found too.
      const config = payload.collections[collection as 'tasks'].config.flattenedFields.find(
        (candidate) => 'name' in candidate && candidate.name === field,
      )
      expect(config?.type).toBe('array')
      const labels = (config as { labels?: { singular?: unknown } }).labels
      expect(labels?.singular).toBe(SINGULAR[kind])
    },
  )
})

describe('GET /courseware/row-labels', () => {
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

  it('refuses a request with no signed-in user, even with the library token', async () => {
    const { status } = await callEndpoint(payload, '/courseware/row-labels')
    expect(status).toBe(401)
    expect((await callEndpoint(payload, '/courseware/row-labels', { token: null })).status).toBe(
      401,
    )
  })

  it('gives a signed-in user what the labels need, with task numbers from the tree', async () => {
    const framework = await payload.create({
      collection: 'frameworks',
      data: { name: 'USA', edition: '2026-10' },
    })
    const competency = await payload.create({
      collection: 'competencies',
      data: { framework: framework.id, sourceId: '2.2.2a', title: 'Taxi to Runway' },
    })
    const source = await payload.create({
      collection: 'sources',
      data: { name: 'KIND SOP', edition: '2026-03', url: 'https://example.com/sop' },
    })
    const credential = await payload.create({
      collection: 'credentials',
      data: { code: 'X-GC', kind: 'certification', name: 'Example Ground', rank: 1 },
    })
    const first = await payload.create({ collection: 'tasks', data: { name: 'Airport layout' } })
    const second = await payload.create({ collection: 'tasks', data: { name: 'Taxi' } })
    const child = await payload.create({
      collection: 'tasks',
      data: { name: 'Taxi to runway', parent: second.id },
    })
    // Retiring a task leaves its place in the tree: it keeps its number.
    await payload.update({ collection: 'tasks', id: second.id, data: { retired: true } })

    const { status, body } = await callEndpoint(payload, '/courseware/row-labels', {
      token: null,
      user: author,
    })

    expect(status).toBe(200)
    expect(body.competencies[competency.id]).toEqual({
      framework: 'USA',
      edition: '2026-10',
      sourceId: '2.2.2a',
      title: 'Taxi to Runway',
    })
    expect(body.sources[source.id]).toEqual({ name: 'KIND SOP', edition: '2026-03' })
    expect(body.credentials[credential.id]).toBe('X-GC')
    expect(body.tasks[first.id]).toEqual({ number: '1', name: 'Airport layout' })
    expect(body.tasks[second.id]).toEqual({ number: '2', name: 'Taxi' })
    expect(body.tasks[child.id]).toEqual({ number: '2.1', name: 'Taxi to runway' })
  })
})
