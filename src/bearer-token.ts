import { timingSafeEqual } from 'node:crypto'
import type { PayloadRequest } from 'payload'

/**
 * Whether the request carries `expected` as a bearer token, compared in constant time. With no
 * token configured, nobody gets in.
 */
export function hasBearerToken(req: PayloadRequest, expected: string | undefined): boolean {
  const header = req.headers.get('authorization') ?? ''
  if (!expected || !header.startsWith('Bearer ')) return false
  const given = Buffer.from(header.slice('Bearer '.length))
  const wanted = Buffer.from(expected)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

export const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })
