import type { Payload, PayloadRequest } from 'payload'

type Collection = 'frameworks' | 'competencies'
type Doc = Record<string, unknown> & { id: string }
/** Only what the import asks: every field equal to a value. */
type Equals = Record<string, string>

/**
 * What the import needs from the CMS. The engineer runs it against the deployed CMS over its REST
 * API (`restStore`); the admin's import page runs it as the signed-in person (`requestStore`), and
 * its "Check" through `dryRunStore`; tests run it through the Local API (`localStore`).
 */
export type Store = {
  findAll(collection: Collection, where: Equals): Promise<Doc[]>
  create(collection: Collection, data: Record<string, unknown>): Promise<Doc>
  update(collection: Collection, id: string, data: Record<string, unknown>): Promise<void>
}

const toWhere = (where: Equals) =>
  Object.fromEntries(Object.entries(where).map(([field, value]) => [field, { equals: value }]))

export function localStore(payload: Payload): Store {
  return {
    async findAll(collection, where) {
      const { docs } = await payload.find({
        collection,
        where: toWhere(where),
        pagination: false,
        depth: 0,
      })
      return docs as unknown as Doc[]
    },
    async create(collection, data) {
      return (await payload.create({ collection, data: data as never, depth: 0 })) as unknown as Doc
    },
    async update(collection, id, data) {
      await payload.update({ collection, id, data: data as never, depth: 0 })
    },
  }
}

/**
 * The Local API as the person making a request, through the collections' own access rules, and in
 * the request's transaction when it has one.
 */
export function requestStore(req: PayloadRequest): Store {
  const as = { req, user: req.user, overrideAccess: false, depth: 0 } as const
  return {
    async findAll(collection, where) {
      const { docs } = await req.payload.find({
        collection,
        where: toWhere(where),
        pagination: false,
        ...as,
      })
      return docs as unknown as Doc[]
    },
    async create(collection, data) {
      return (await req.payload.create({
        collection,
        data: data as never,
        ...as,
      })) as unknown as Doc
    },
    async update(collection, id, data) {
      await req.payload.update({ collection, id, data: data as never, ...as })
    },
  }
}

/**
 * Reads through `store` and writes nothing: the import's dry run. A record it would create is kept
 * here, with a made-up id, so the rest of the run finds it as the real import would.
 */
export function dryRunStore(store: Store): Store {
  const created: (Doc & { collection: Collection })[] = []
  const madeUp = (value: string) => created.some((doc) => doc.id === value)
  return {
    async findAll(collection, where) {
      const stored = Object.values(where).some(madeUp) ? [] : await store.findAll(collection, where)
      const pending = created.filter(
        (doc) =>
          doc.collection === collection &&
          Object.entries(where).every(([field, value]) => doc[field] === value),
      )
      return [...stored, ...pending]
    },
    async create(collection, data) {
      const doc = { ...data, id: `dry-run-${created.length + 1}`, collection }
      created.push(doc)
      return doc
    },
    async update() {},
  }
}

/** The CMS's REST API, signed in as a CMS account (a JWT from `POST /api/users/login`). */
export function restStore(baseUrl: string, token: string): Store {
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(new URL(`/api/${path}`, baseUrl), {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `JWT ${token}`,
        ...init.headers,
      },
    })
    const body = await response.json()
    if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${JSON.stringify(body)}`)
    return body
  }
  return {
    async findAll(collection, where) {
      const query = new URLSearchParams({ limit: '0', depth: '0', pagination: 'false' })
      for (const [field, value] of Object.entries(where)) {
        query.set(`where[${field}][equals]`, value)
      }
      return (await call(`${collection}?${query}`)).docs
    },
    async create(collection, data) {
      return (await call(collection, { method: 'POST', body: JSON.stringify(data) })).doc
    },
    async update(collection, id, data) {
      await call(`${collection}/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
    },
  }
}

/** Signs in to the CMS and returns the token `restStore` needs. */
export async function signIn(baseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetch(new URL('/api/users/login', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new Error(`Signing in to ${baseUrl} failed: ${response.status}`)
  return (await response.json()).token
}
