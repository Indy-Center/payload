import { handleEndpoints, type Payload, type PayloadRequest } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import config from '@/payload.config'
import { publicEndpoints } from '@/public/endpoints'
import { publicRead } from '@/public/read'
import { testPayload } from '../courseware/helpers'
import { expectPublicHeaders, readPublic } from './helpers'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

afterEach(() => {
  vi.restoreAllMocks()
})

type Widget = { code: string; name: string }

const read = (endpoint: ReturnType<typeof publicRead>) =>
  readPublic(payload, endpoint.path, [endpoint])

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
    expectPublicHeaders(headers, 120)
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

  // Through Payload's own router, as a real request arrives, rather than calling the handler. The
  // GET is the control: it shows the router finds these paths, so the 404s are about the method.
  it('answers a GET to every public read through the router', async () => {
    for (const { path } of publicEndpoints) {
      const response = await handleEndpoints({
        config,
        request: new Request(`http://localhost:3000/api${path}`),
      })
      expect(response.status).toBe(200)
    }
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    "gives %s to every public read Payload's 404",
    async (method) => {
      for (const { path } of publicEndpoints) {
        const response = await handleEndpoints({
          config,
          request: new Request(`http://localhost:3000/api${path}`, { method }),
        })
        expect(response.status).toBe(404)
        expect(await response.json()).toEqual({ message: `Route not found "/api${path}"` })
      }
    },
  )
})
