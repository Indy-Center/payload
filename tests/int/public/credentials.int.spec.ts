import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase, testPayload } from '../courseware/helpers'
import { expectPublicHeaders, readPublic } from './helpers'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
})

const read = () => readPublic(payload, '/public/v1/credentials')

const credential = (data: Record<string, unknown>) =>
  payload.create({ collection: 'credentials', data: data as never })

describe('GET /api/public/v1/credentials', () => {
  it('serves each credential in exactly the public shape, retired ones flagged', async () => {
    await credential({
      code: 'X-GC',
      kind: 'certification',
      name: 'Example Ground',
      rank: 2,
      description: 'Works ground control.',
      grantedOnArrival: ['S1'],
    })
    await credential({ code: 'X-LC', kind: 'endorsement', name: 'Example Local' })
    await credential({
      code: 'X-OLD',
      kind: 'endorsement',
      name: 'Example Old',
      description: 'No longer issued.',
      retired: true,
    })

    const { status, body } = await read()

    expect(status).toBe(200)
    expect(body).toEqual([
      {
        code: 'X-GC',
        name: 'Example Ground',
        kind: 'certification',
        rank: 2,
        description: 'Works ground control.',
        retired: false,
      },
      {
        code: 'X-LC',
        name: 'Example Local',
        kind: 'endorsement',
        rank: null,
        description: '',
        retired: false,
      },
      {
        code: 'X-OLD',
        name: 'Example Old',
        kind: 'endorsement',
        rank: null,
        description: 'No longer issued.',
        retired: true,
      },
    ])
  })

  it('lists certifications by rank, then endorsements by code', async () => {
    await credential({ code: 'X-ZED', kind: 'endorsement', name: 'Zed' })
    await credential({ code: 'X-TWR', kind: 'certification', name: 'Tower', rank: 3 })
    await credential({ code: 'X-ALP', kind: 'endorsement', name: 'Alpha' })
    await credential({ code: 'X-DEL', kind: 'certification', name: 'Delivery', rank: 1 })
    await credential({ code: 'X-GC', kind: 'certification', name: 'Ground', rank: 2 })

    const { body } = await read()

    expect(body.map((item: { code: string }) => item.code)).toEqual([
      'X-DEL',
      'X-GC',
      'X-TWR',
      'X-ALP',
      'X-ZED',
    ])
  })

  it('answers 200 and an empty list when there are no credentials', async () => {
    const { status, body } = await read()
    expect(status).toBe(200)
    expect(body).toEqual([])
  })

  it('carries the public headers: cached five minutes, nosniff, no Vary or CORS', async () => {
    const { headers } = await read()
    expectPublicHeaders(headers, 300)
  })
})
