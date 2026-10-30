import type { Payload } from 'payload'
import { format, resolveConfig } from 'prettier'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { image, removeUploads, upload } from '../partners/helpers'
import { callEndpoint, resetDatabase, testPayload } from './helpers'
import {
  block,
  cell,
  heading,
  inline,
  link,
  list,
  node,
  paragraph,
  row,
  state,
  text,
} from './lexical'

/*
 * The body as the library reads it: Lexical's JSON, its linked records filled in with only what
 * the page draws (design-system documents 02). The fixture is written from what is served here.
 */

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await removeUploads(payload)
  await resetDatabase(payload)
})

afterAll(async () => {
  await removeUploads(payload)
})

/** Every node and block a lesson plan's body allows, pointing at the given records. */
function everyNode(ids: { plan: string; media: string; source: string }) {
  return state([
    heading('h2', 'Runways'),
    heading('h3', 'In use'),
    heading('h4', 'At night'),
    paragraph([
      text('Bold', 1),
      text(' italic', 2),
      text(' struck', 4),
      text(' underlined', 8),
      text(' code', 16),
      text(' sub', 32),
      text(' super', 64),
      { type: 'linebreak', version: 1 },
      text('After a break.'),
    ]),
    paragraph([text('Centred.')], 'center'),
    paragraph([text('To the end.')], 'end'),
    paragraph([text('Justified.')], 'justify'),
    list('bullet', [[text('One')], [list('bullet', [[text('One, nested')]])]]),
    list('number', [[text('First')], [text('Second')]]),
    list('check', [[text('Ticked')], [text('Not ticked')]], [true, false]),
    paragraph([
      link(
        '6718a0c0e1f2a3b4c5d6e711',
        { linkType: 'custom', url: 'https://example.com/', newTab: true },
        'Out',
      ),
      text(' and '),
      link(
        '6718a0c0e1f2a3b4c5d6e712',
        {
          linkType: 'internal',
          doc: { relationTo: 'lesson-plans', value: ids.plan },
          newTab: false,
        },
        'In',
      ),
    ]),
    { ...node, type: 'quote', children: [text('Quoted.')] },
    { type: 'horizontalrule', version: 1 },
    {
      type: 'upload',
      version: 3,
      format: '',
      id: '6718a0c0e1f2a3b4c5d6e713',
      fields: null,
      relationTo: 'media',
      value: ids.media,
    },
    {
      ...node,
      type: 'table',
      colWidths: [120, 120],
      children: [
        row([cell('Runway', 1), cell('Use', 1)]),
        row([cell('5L', 2), cell('Arrivals', 0)]),
        row([cell('Both', 2), cell('Departures at night', 0)]),
        row([cell('Merged across', 0, { colSpan: 2 })]),
      ],
    },
    block('6718a0c0e1f2a3b4c5d6e721', 'callout', {
      level: 'reference',
      label: 'See also',
      content: state([
        paragraph([
          text('Wake turbulence: '),
          inline('6718a0c0e1f2a3b4c5d6e722', 'citation', { source: ids.source, at: '2-1-20' }),
        ]),
      ]),
    }),
    block('6718a0c0e1f2a3b4c5d6e723', 'disclosure', {
      summary: 'Why?',
      content: state([paragraph([text('Because.')])]),
    }),
    paragraph([
      inline('6718a0c0e1f2a3b4c5d6e731', 'position', {
        callsign: 'IND_CTR',
        show: ['shortName', 'frequency'],
        airportAt: 'under',
        airport: { code: 'KIND', name: 'Example International' },
      }),
      text(' on '),
      inline('6718a0c0e1f2a3b4c5d6e732', 'frequency', { value: '128.225' }),
      text(' or '),
      inline('6718a0c0e1f2a3b4c5d6e733', 'frequency', { callsign: 'IND_CTR' }),
      text(' at '),
      inline('6718a0c0e1f2a3b4c5d6e734', 'airport', {
        airport: { code: 'KIND', name: 'Example International' },
        nameAt: 'tooltip',
        focusable: true,
      }),
      text(', '),
      inline('6718a0c0e1f2a3b4c5d6e735', 'rating', { rating: 'S3', kind: 'controller' }),
      text(', '),
      inline('6718a0c0e1f2a3b4c5d6e736', 'rating', { rating: 'IR', kind: 'pilot' }),
      text(', '),
      inline('6718a0c0e1f2a3b4c5d6e737', 'flightCategory', { category: 'IFR' }),
      text(', '),
      inline('6718a0c0e1f2a3b4c5d6e738', 'time', { value: '2300', end: '0300' }),
      text(', '),
      inline('6718a0c0e1f2a3b4c5d6e739', 'citation', { source: ids.source, at: '3-7-2' }),
    ]),
  ])
}

/**
 * A draft course version whose second lesson plan has every node and block in its body, and the
 * records it points at, as the course-version document serves them.
 */
async function planWithEveryNode() {
  const course = await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower' },
  })
  const version = await payload.create({
    collection: 'course-versions',
    data: { course: course.id, number: 1, status: 'draft' },
  })
  const other = await payload.create({
    collection: 'lesson-plans',
    data: { courseVersion: version.id, code: 'X-TWR-0', title: 'Before', description: 'No body' },
  })
  const media = await upload(payload, { ...(await image(800, 600)), name: 'runway.png' })
  const source = await payload.create({
    collection: 'sources',
    data: { name: 'JO 0000.00', edition: 'A', url: 'https://example.com/order' },
  })
  const ids = { plan: other.id, media: media.id, source: source.id }
  const plan = await payload.create({
    collection: 'lesson-plans',
    data: { courseVersion: version.id, code: 'X-TWR-1', title: 'Runways', body: everyNode(ids) },
  })
  await payload.update({
    collection: 'course-versions',
    id: version.id,
    data: { modules: [{ title: 'Tower', lessonPlans: [other.id, plan.id] }] },
  })
  const { body } = await callEndpoint(payload, '/courseware/courses/X-TWR/draft')
  const [before, served] = body.modules[0].lessonPlans
  return { ids, before, served, other, media, source }
}

/** The body with each filled-in record put back to its id, as it was saved. */
function unfilled(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unfilled)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => {
      const record = field as { id?: unknown } | null
      if ((key === 'value' || key === 'source') && typeof record?.id === 'string') {
        return [key, record.id]
      }
      return [key, unfilled(field)]
    }),
  )
}

/**
 * The served body as a fixture, formatted as the repo formats JSON: record ids swapped for names,
 * and file sizes, which vary with the image encoder, left out as Payload leaves out a missing one.
 */
async function fixture(value: unknown, ids: Record<string, string>): Promise<string> {
  let json = JSON.stringify(value)
  for (const [name, id] of Object.entries(ids)) json = json.replaceAll(id, `<${name}-id>`)
  json = json.replaceAll(/"filesize":\d+/g, '"filesize":null')
  return format(json, { ...(await resolveConfig('fixture.json')), parser: 'json' })
}

/** Every node of a body, depth first. */
function nodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (value === null || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  return [record, ...Object.values(record).flatMap(nodes)]
}

describe('a lesson plan body in the course-version document', () => {
  it('reads back every node and block as Lexical JSON', async () => {
    const { ids, served } = await planWithEveryNode()

    // Linked records are filled in; everything else is as saved.
    expect(unfilled(served.body)).toEqual(everyNode(ids))
    await expect(await fixture(served.body, ids)).toMatchFileSnapshot(
      './fixtures/lesson-plan-body.json',
    )
  })

  it('still sends the body as HTML', async () => {
    const { served } = await planWithEveryNode()

    expect(served.bodyHtml).toContain('<h2>Runways</h2>')
    expect(served.bodyHtml).toContain('Centred.')
  })

  it('sends a plan with no body as null', async () => {
    const { before } = await planWithEveryNode()

    expect(before.body).toBeNull()
  })

  it('fills in a link, an upload and a citation with only the fields the page draws', async () => {
    const { served, other, media, source } = await planWithEveryNode()
    const all = nodes(served.body.root)

    const internal = all.find(
      (each) =>
        each.type === 'link' && (each.fields as { linkType: string }).linkType === 'internal',
    )
    expect((internal!.fields as { doc: unknown }).doc).toEqual({
      relationTo: 'lesson-plans',
      value: { id: other.id, code: 'X-TWR-0', title: 'Before' },
    })

    const image = all.find((each) => each.type === 'upload')!.value as Record<string, unknown>
    expect(Object.keys(image).sort()).toEqual([
      'alt',
      'filename',
      'height',
      'id',
      'sizes',
      'url',
      'width',
    ])
    expect(image).toMatchObject({
      id: media.id,
      alt: 'An example image',
      url: '/api/media/file/runway.png',
      width: 800,
      height: 600,
    })
    expect(Object.keys(image.sizes as object).sort()).toEqual([
      'banner',
      'large',
      'logo',
      'thumbnail',
    ])

    const citations = all.filter(
      (each) =>
        each.type === 'inlineBlock' &&
        (each.fields as { blockType: string }).blockType === 'citation',
    )
    expect(citations).toHaveLength(2)
    for (const each of citations) {
      const cited = (each.fields as { source: Record<string, unknown> }).source
      expect(Object.keys(cited).sort()).toEqual(['edition', 'id', 'name', 'url'])
      expect(cited).toMatchObject({
        id: source.id,
        name: 'JO 0000.00',
        edition: 'A',
        url: 'https://example.com/order',
      })
    }
  })
})
