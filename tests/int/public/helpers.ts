import type { Endpoint, Payload } from 'payload'
import { expect } from 'vitest'
import { publicEndpoints } from '@/public/endpoints'
import { endpointResponse } from '../courseware/helpers'

/** GETs a public read anonymously, as the public reach it: no signed-in user and no token. */
export async function readPublic(
  payload: Payload,
  path: string,
  endpoints: Endpoint[] = publicEndpoints,
) {
  const response = await endpointResponse(payload, path, { token: null, endpoints })
  return { status: response.status, headers: response.headers, body: await response.json() }
}

/** What a good public read sends: JSON, cached `maxAge` seconds, nosniff, no Vary or CORS. */
export function expectPublicHeaders(headers: Headers, maxAge: number) {
  expect(headers.get('content-type')).toBe('application/json')
  expect(headers.get('cache-control')).toBe(`public, max-age=${maxAge}`)
  expect(headers.get('x-content-type-options')).toBe('nosniff')
  expect(headers.get('vary')).toBeNull()
  expect([...headers.keys()].filter((key) => key.startsWith('access-control-'))).toEqual([])
}
