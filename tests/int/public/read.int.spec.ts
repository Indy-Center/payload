import type { Payload, PayloadRequest } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { publicRead } from '@/public/read'
import { endpointResponse, testPayload } from '../courseware/helpers'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

afterEach(() => {
  vi.restoreAllMocks()
})

type Widget = { code: string; name: string }

// Anonymous, as the public reach these routes: no signed-in user and no token.
async function read(endpoint: ReturnType<typeof publicRead>) {
  const response = await endpointResponse(payload, endpoint.path, {
    token: null,
    endpoints: [endpoint],
  })
  return { status: response.status, headers: response.headers, body: await response.json() }
}

describe('publicRead', () => {
  it('registers a GET at /public/v1/<name>', () => {
    const endpoint = publicRead('widgets', async () => [], { maxAge: 300 })
    expect(endpoint.path).toBe('/public/v1/widgets')
    expect(endpoint.method).toBe('get')
  })

  it('answers the build, cached for the given max-age, to an anonymous request', async () => {
    let seen: PayloadRequest | undefined
    const endpoint = publicRead<Widget[]>(
      'widgets',
      async (req) => {
        seen = req
        return [{ code: 'W1', name: 'First widget' }]
      },
      { maxAge: 120 },
    )

    const { status, headers, body } = await read(endpoint)

    expect(seen?.user).toBeFalsy()
    expect(seen?.headers.get('authorization')).toBeNull()
    expect(status).toBe(200)
    expect(body).toEqual([{ code: 'W1', name: 'First widget' }])
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('cache-control')).toBe('public, max-age=120')
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('vary')).toBeNull()
    expect([...headers.keys()].filter((key) => key.startsWith('access-control-'))).toEqual([])
  })

  it('answers 500, uncached and without the error text, and logs it, when the build throws', async () => {
    const error = vi.spyOn(payload.logger, 'error').mockImplementation(() => {})
    const failure = new Error('relation "widgets" does not exist')
    const endpoint = publicRead<Widget[]>(
      'widgets',
      async () => {
        throw failure
      },
      { maxAge: 120 },
    )

    const { status, headers, body } = await read(endpoint)

    expect(status).toBe(500)
    expect(body).toEqual({ errors: [{ message: 'Could not build widgets.' }] })
    expect(headers.get('cache-control')).toBe('no-store')
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('vary')).toBeNull()
    expect(error).toHaveBeenCalledWith(
      { err: failure },
      'Public read /api/public/v1/widgets could not be built.',
    )
  })
})
