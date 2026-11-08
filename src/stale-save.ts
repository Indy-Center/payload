import { sql } from '@payloadcms/db-postgres'
import {
  APIError,
  type CollectionBeforeOperationHook,
  type CollectionConfig,
  type CollectionSlug,
  type GlobalAfterChangeHook,
  type GlobalBeforeOperationHook,
  type GlobalConfig,
  type GlobalSlug,
  type Plugin,
  type PayloadRequest,
} from 'payload'

/**
 * A save made from a copy of a record that has been saved since is refused (courseware decision
 * 0068), so two people editing one record at once never silently overwrite each other. Every
 * screen of the admin that saves says when the record it was made from was last saved, its
 * `updatedAt`, and the save is checked here, in its own transaction.
 */

/** The record a save is made to: a collection's document, or a global. */
export type SavedRecord = { collection: CollectionSlug; id: string } | { global: GlobalSlug }

/** Payload's edit forms' refusal: they send the `updatedAt` they loaded with every save. */
export const STALE_SAVE =
  'Someone else saved this since you opened it. Reload the page and make your changes again.'

type SQL = ReturnType<typeof sql>
type Database = { execute: (query: SQL) => Promise<{ rowCount: number }> }
type Adapter = {
  drizzle: Database
  sessions: Record<string, { db: Database }>
  tableNameMap: Map<string, string>
}

/**
 * Refuses the save with `message` (a 409) unless the record is still as the screen saw it, its
 * `updatedAt` unchanged, and locks the record's row for the rest of the request's transaction, so
 * no other save lands between this check and the save. Of two saves sent together from one
 * `updatedAt`, the second waits for the first, then finds the record changed and is refused. An
 * `updatedAt` that is missing or isn't a date is refused too. Must run in a transaction.
 */
export async function refuseStaleSave(
  req: PayloadRequest,
  record: SavedRecord,
  updatedAt: unknown,
  message: string,
): Promise<void> {
  if (!(await isUnchangedSince(req, record, updatedAt)))
    throw new APIError(message, 409, null, true)
}

/** `refuseStaleSave`'s check alone: whether the record is unchanged, its row then locked. */
export async function isUnchangedSince(
  req: PayloadRequest,
  record: SavedRecord,
  updatedAt: unknown,
): Promise<boolean> {
  const seen = typeof updatedAt === 'string' ? new Date(updatedAt) : null
  if (!seen || Number.isNaN(seen.getTime())) return false
  if (!req.transactionID) throw new Error('The stale-save check needs a transaction.')
  // A no-op update: it takes the row's lock, and touches it only if it is still the one seen.
  const rowCount = await updateRow(
    req,
    record,
    sql`"updated_at" = "updated_at"`,
    sql`"updated_at" = ${seen.toISOString()}::timestamptz`,
  )
  return rowCount === 1
}

/** Updates the record's own row, in the request's transaction if it has one, if it meets `where`. */
async function updateRow(
  req: PayloadRequest,
  record: SavedRecord,
  set: SQL,
  where: SQL,
): Promise<number> {
  const adapter = req.payload.db as unknown as Adapter
  const transaction = req.transactionID ? await req.transactionID : null
  const db = transaction ? adapter.sessions[String(transaction)].db : adapter.drizzle
  const slug = 'global' in record ? record.global : record.collection
  const table = adapter.tableNameMap.get(slug.replaceAll('-', '_'))
  if (!table) throw new Error(`The stale-save check found no table for ${slug}.`)
  // A global's table holds its one row.
  const ofRecord = 'global' in record ? sql`` : sql`"id" = ${record.id} AND `
  const { rowCount } = await db.execute(
    sql`UPDATE ${sql.identifier(table)} SET ${set} WHERE ${ofRecord}${where}`,
  )
  return rowCount
}

/** A save that says what it was made from: one with an `updatedAt` in its data. */
const sentUpdatedAt = (data: unknown): unknown =>
  data && typeof data === 'object' ? (data as { updatedAt?: unknown }).updatedAt : undefined

/**
 * An edit form's save of one document. It runs before every other rule and validation, so a
 * stale save is refused as stale: the person reloads before any other refusal is worth reading.
 * A record the person can't read is refused as such, not as stale, as the Content tab does. A
 * save without `updatedAt` (the seed, the importers, scripts) isn't checked.
 */
const refuseStaleDocument: CollectionBeforeOperationHook = async ({
  args,
  collection,
  operation,
  overrideAccess,
  req,
}) => {
  if (operation !== 'update') return args
  const { id, data } = args as { id?: unknown; data?: unknown }
  const updatedAt = sentUpdatedAt(data)
  if ((typeof id !== 'string' && typeof id !== 'number') || updatedAt == null) return args
  const slug = collection.slug as CollectionSlug
  if (await isUnchangedSince(req, { collection: slug, id: String(id) }, updatedAt)) return args
  if (!overrideAccess) {
    await req.payload.findByID({ collection: slug, id, depth: 0, req, overrideAccess: false })
  }
  throw new APIError(STALE_SAVE, 409, null, true)
}

/** The same for a global's form. */
const refuseStaleGlobal: GlobalBeforeOperationHook = async ({
  args,
  global,
  operation,
  overrideAccess,
  req,
}) => {
  if (operation !== 'update') return args
  const updatedAt = sentUpdatedAt((args as { data?: unknown }).data)
  if (updatedAt == null) return args
  const slug = global.slug as GlobalSlug
  if (await isUnchangedSince(req, { global: slug }, updatedAt)) return args
  if (!overrideAccess) await req.payload.findGlobal({ slug, depth: 0, req, overrideAccess: false })
  throw new APIError(STALE_SAVE, 409, null, true)
}

/**
 * Marks a global as saved. Payload's Postgres adapter writes a row's `updated_at` only along with
 * one of its own columns, and a global whose fields all live in tables of their own (Teacher
 * resources: one array) has none, so its `updatedAt` would never move and a stale save would pass.
 */
const markGlobalSaved: GlobalAfterChangeHook = async ({ doc, global, req }) => {
  const now = new Date().toISOString()
  await updateRow(
    req,
    { global: global.slug as GlobalSlug },
    sql`"updated_at" = ${now}::timestamptz`,
    sql`true`,
  )
  return { ...doc, updatedAt: now }
}

const checkedCollection = (collection: CollectionConfig): CollectionConfig => ({
  ...collection,
  hooks: {
    ...collection.hooks,
    beforeOperation: [refuseStaleDocument, ...(collection.hooks?.beforeOperation ?? [])],
  },
})

const checkedGlobal = (global: GlobalConfig): GlobalConfig => ({
  ...global,
  hooks: {
    ...global.hooks,
    beforeOperation: [refuseStaleGlobal, ...(global.hooks?.beforeOperation ?? [])],
    afterChange: [markGlobalSaved, ...(global.hooks?.afterChange ?? [])],
  },
})

/**
 * Puts the stale-save check on every collection's and global's saves, so every edit form in the
 * admin is held to it, including ones added later.
 */
export const staleSaves: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map(checkedCollection),
  globals: config.globals?.map(checkedGlobal),
})
