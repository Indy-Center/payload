import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { publicEndpoints } from '@/public/endpoints'
import { endpointResponse, resetDatabase, testPayload } from '../courseware/helpers'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
})

// Anonymous, as the public reach it: no signed-in user and no token.
async function read() {
  const response = await endpointResponse(payload, '/public/v1/credentials', {
    token: null,
    endpoints: publicEndpoints,
  })
  return { status: response.status, headers: response.headers, body: await response.json() }
}

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
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('cache-control')).toBe('public, max-age=300')
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('vary')).toBeNull()
    expect([...headers.keys()].filter((key) => key.startsWith('access-control-'))).toEqual([])
  })
})
