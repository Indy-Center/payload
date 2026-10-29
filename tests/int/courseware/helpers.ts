import { createLocalReq, getPayload, type Payload } from 'payload'
import config from '@/payload.config'

export const TOKEN = 'test-library-token'
process.env.LIBRARY_API_TOKEN = TOKEN

let cached: Payload | null = null

export async function testPayload(): Promise<Payload> {
  cached ??= await getPayload({ config: await config })
  return cached
}

export { resetDatabase } from '@/dev/reset-database'

/**
 * Calls one of the CMS's own endpoints the way an HTTP request would reach it, and returns the
 * status and JSON body.
 */
export async function callEndpoint(
  payload: Payload,
  path: string,
  options: {
    token?: string | null
    method?: string
    /** The JSON body, or an Error for `req.json()` to throw. */
    body?: unknown
    /** A multipart body, as a browser's form upload sends it. */
    formData?: FormData
    user?: Awaited<ReturnType<Payload['create']>>
  } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests read the JSON freely
): Promise<{ status: number; body: any }> {
  const method = options.method ?? 'get'
  // A query string becomes `req.query`, as Payload parses it.
  const [pathname, search = ''] = path.split('?')
  path = pathname
  const endpoint = payload.config.endpoints.find(
    (candidate) => candidate.method === method && matchPath(candidate.path, path) !== null,
  )
  if (!endpoint) throw new Error(`No ${method} endpoint for ${path}`)

  const req = await createLocalReq({}, payload)
  const headers = new Headers()
  const token = options.token === undefined ? TOKEN : options.token
  if (token !== null) headers.set('authorization', `Bearer ${token}`)
  req.headers = headers
  if (options.user) req.user = { ...options.user, collection: 'users' } as typeof req.user
  // An Error for a body is what `req.json()` throws, as for a body that isn't JSON.
  if (options.body instanceof Error) {
    const error = options.body
    req.json = async () => {
      throw error
    }
  } else if (options.body !== undefined) req.json = async () => options.body
  if (options.formData !== undefined) req.formData = async () => options.formData!
  req.routeParams = matchPath(endpoint.path, path) ?? {}
  req.query = Object.fromEntries(new URLSearchParams(search))

  const response = await endpoint.handler(req)
  return { status: response.status, body: await response.json() }
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const wanted = pattern.split('/').filter(Boolean)
  const given = path.split('/').filter(Boolean)
  if (wanted.length !== given.length) return null
  const params: Record<string, string> = {}
  for (const [index, part] of wanted.entries()) {
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(given[index])
    else if (part !== given[index]) return null
  }
  return params
}

/**
 * A made-up position, stored as the sync stores one: its vNAS id is `vnas-` and the callsign.
 * Positions are never created by hand, so this writes below access.
 */
export async function position(
  payload: Payload,
  callsign: string,
  {
    name = `${callsign} example`,
    shortName = null,
    retired = false,
  }: { name?: string; shortName?: string | null; retired?: boolean } = {},
) {
  return payload.create({
    collection: 'positions',
    depth: 0,
    data: {
      vnasId: `vnas-${callsign}`,
      callsign,
      name,
      shortName,
      title: callsign,
      radioName: 'Example Radio',
      frequency: 118_000_000,
      facilityId: callsign.split('_')[0],
      facilityName: 'Example facility',
      retired,
    },
  })
}

/**
 * A made-up scenario's positions, `{ studentPosition, teacherPosition }` ids: XYZ_GND and
 * XYZ_TWR, made the first time they are asked for after a reset.
 */
export async function scenarioPositions(payload: Payload) {
  const idOf = async (callsign: string) => {
    const { docs } = await payload.find({
      collection: 'positions',
      where: { callsign: { equals: callsign } },
      depth: 0,
      limit: 1,
    })
    return (docs[0] ?? (await position(payload, callsign))).id
  }
  return { studentPosition: await idOf('XYZ_GND'), teacherPosition: await idOf('XYZ_TWR') }
}

/** Lexical rich text holding one paragraph. */
export function paragraph(text: string) {
  return {
    root: {
      type: 'root',
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          version: 1,
          textFormat: 0,
          children: [
            { type: 'text', text, detail: 0, format: 0, mode: 'normal', style: '', version: 1 },
          ],
        },
      ],
    },
  }
}
