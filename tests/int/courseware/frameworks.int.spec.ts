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

/** A made-up USA-style framework edition: one heading and one standard beneath it. */
async function framework() {
  const usa = await payload.create({
    collection: 'frameworks',
    data: { name: 'USA', edition: 'Test edition' },
  })
  const heading = await payload.create({
    collection: 'competencies',
    data: { framework: usa.id, sourceId: '9.1', title: 'Example heading' },
  })
  const standard = await payload.create({
    collection: 'competencies',
    data: {
      framework: usa.id,
      sourceId: '9.1.1',
      title: 'Example standard',
      text: 'Does the example thing.',
      parent: heading.id,
      sourceReference: '1-2-3',
      rubricTheory: 'Explains the example thing.',
      pairedGcapCode: 'Z.9.a.i',
    },
  })
  return { usa, heading, standard }
}

describe('mappings', () => {
  it('refuses a mapping to a competency with no text', async () => {
    const { heading } = await framework()

    await expect(
      payload.create({
        collection: 'tasks',
        data: { name: 'Radio', mappings: [{ competency: heading.id }] },
      }),
    ).rejects.toThrow()
  })

  it('shows the GCAP code VATUSA pairs a USA competency with', async () => {
    const { standard } = await framework()

    const radio = await payload.create({
      collection: 'tasks',
      data: { name: 'Radio', mappings: [{ competency: standard.id }] },
    })

    expect(radio.mappings?.[0].pairedGcapCode).toBe('Z.9.a.i')
  })

  it('applies a mapping on a task to every task beneath it', async () => {
    const { standard } = await framework()
    const radio = await payload.create({
      collection: 'tasks',
      data: { name: 'Radio', mappings: [{ competency: standard.id }] },
    })
    const readbacks = await payload.create({
      collection: 'tasks',
      data: { name: 'Readbacks', parent: radio.id },
    })

    const { body } = await callEndpoint(payload, '/courseware/catalogue')
    const served = body.tasks.find((entry: { id: string }) => entry.id === readbacks.id)

    expect(served.mappings).toEqual([{ competencyId: standard.id, fromTaskId: radio.id }])
  })
})

describe('references', () => {
  it('needs a link or an Indy document', async () => {
    await expect(
      payload.create({ collection: 'references', data: { name: 'Order', edition: 'A' } }),
    ).rejects.toThrow()
  })

  it('are cited by tasks with a section, and served in the catalogue', async () => {
    const order = await payload.create({
      collection: 'references',
      data: { name: 'Example Order', edition: 'B', url: 'https://example.com/order' },
    })
    await payload.create({
      collection: 'tasks',
      data: { name: 'Radio', citations: [{ reference: order.id, section: '3-7-2' }] },
    })

    const { body } = await callEndpoint(payload, '/courseware/catalogue')

    expect(body.references).toEqual([
      { id: order.id, name: 'Example Order', edition: 'B', url: 'https://example.com/order' },
    ])
    expect(body.tasks[0].citations).toEqual([{ referenceId: order.id, section: '3-7-2' }])
  })
})

describe('the catalogue', () => {
  it('serves frameworks and their competencies', async () => {
    const { usa, heading, standard } = await framework()

    const { body } = await callEndpoint(payload, '/courseware/catalogue')

    expect(body.frameworks).toEqual([{ id: usa.id, name: 'USA', edition: 'Test edition' }])
    expect(body.competencies).toEqual([
      {
        id: heading.id,
        frameworkId: usa.id,
        sourceId: '9.1',
        title: 'Example heading',
        text: '',
        parentId: null,
        sourceReference: '',
        rubricTheory: '',
        rubricPractical: '',
        pairedGcapCode: '',
      },
      {
        id: standard.id,
        frameworkId: usa.id,
        sourceId: '9.1.1',
        title: 'Example standard',
        text: 'Does the example thing.',
        parentId: heading.id,
        sourceReference: '1-2-3',
        rubricTheory: 'Explains the example thing.',
        rubricPractical: '',
        pairedGcapCode: 'Z.9.a.i',
      },
    ])
  })
})
