import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { invalid } from '../partners/helpers'
import { resetDatabase, testPayload } from './helpers'
import { type Body, heading, inline, link, paragraph, state } from './lexical'

/* What a lesson plan's body refuses: its editor follows design-system's documents 02. */

let payload: Payload
let versionId: string

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  const course = await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower' },
  })
  const version = await payload.create({
    collection: 'course-versions',
    data: { course: course.id, number: 1, status: 'draft' },
  })
  versionId = version.id
})

function plan(body: Body) {
  return payload.create({
    collection: 'lesson-plans',
    data: { courseVersion: versionId, code: 'X-TWR-1', body },
  })
}

describe('a lesson plan body', () => {
  it('links internally to lesson plans only', async () => {
    const user = await payload.create({
      collection: 'users',
      data: { email: 'someone@example.com', password: 'example-password' },
    })
    const other = await plan(state([]))
    const internal = (relationTo: string, value: string) =>
      state([
        paragraph([
          link(
            '6718a0c0e1f2a3b4c5d6e701',
            { linkType: 'internal', doc: { relationTo, value }, newTab: false },
            'See',
          ),
        ]),
      ])

    await expect(plan(internal('lesson-plans', other.id))).resolves.toBeTruthy()
    const errors = await invalid(plan(internal('users', user.id)))

    expect(errors.join(' ')).toContain(
      `This field has the following invalid selections: {"relationTo":"users","value":"${user.id}"}`,
    )
  })

  it('refuses an h1, which belongs to the page', async () => {
    const errors = await invalid(plan(state([heading('h1', 'Title')])))

    expect(errors.join(' ')).toContain('Heading tag must be one of h2, h3, h4.')
  })

  it('refuses a frequency with neither a value nor a callsign', async () => {
    const errors = await invalid(
      plan(state([paragraph([inline('6718a0c0e1f2a3b4c5d6e702', 'frequency', {})])])),
    )

    expect(errors.join(' ')).toContain('Give a frequency or a callsign.')
  })

  it('refuses a frequency with both a value and a callsign', async () => {
    const errors = await invalid(
      plan(
        state([
          paragraph([
            inline('6718a0c0e1f2a3b4c5d6e703', 'frequency', {
              value: '128.225',
              callsign: 'IND_CTR',
            }),
          ]),
        ]),
      ),
    )

    expect(errors.join(' ')).toContain('Give a frequency or a callsign, not both.')
  })

  it('refuses a pilot rating given as a controller’s', async () => {
    const errors = await invalid(
      plan(
        state([
          paragraph([
            inline('6718a0c0e1f2a3b4c5d6e704', 'rating', { rating: 'IR', kind: 'controller' }),
          ]),
        ]),
      ),
    )

    expect(errors.join(' ')).toContain('IR is not a controller rating.')
  })

  it('refuses a time that is not four Zulu digits', async () => {
    const errors = await invalid(
      plan(state([paragraph([inline('6718a0c0e1f2a3b4c5d6e705', 'time', { value: '11pm' })])])),
    )

    expect(errors.join(' ')).toContain('A time is four digits, such as 2300.')
  })
})
