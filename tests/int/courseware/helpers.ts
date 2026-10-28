import { createLocalReq, getPayload, type Payload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import config from '@/payload.config'

export const TOKEN = 'test-library-token'
process.env.LIBRARY_API_TOKEN = TOKEN

let cached: Payload | null = null

export async function testPayload(): Promise<Payload> {
  cached ??= await getPayload({ config: await config })
  return cached
}

/** Empties the test database's tables, below the API so retire-not-delete doesn't stop it. */
export async function resetDatabase(payload: Payload): Promise<void> {
  const { pool } = payload.db as unknown as PostgresAdapter
  const { rows } = await pool.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' and tablename not like 'payload_migrations%'`,
  )
  if (rows.length === 0) return
  const tables = rows.map((row) => `"${row.tablename}"`).join(', ')
  await pool.query(`truncate ${tables} cascade`)
}

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
  if (options.body !== undefined) req.json = async () => options.body
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
