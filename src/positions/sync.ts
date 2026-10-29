import type { PayloadRequest } from 'payload'
import { positionTitle } from '@/collections/courseware/Positions'
import { inTransaction } from '@/courseware/edition-actions'
import type { Position } from '@/payload-types'
import { fetchZidPositions, type VnasPosition } from './vnas'

/** How many positions a sync added, changed (un-retiring counts) and retired. */
export type SyncReport = { added: number; changed: number; retired: number }

/** The fields the sync copies from vNAS; everything else on a position is the CMS's own. */
const COPIED = [
  'callsign',
  'name',
  'radioName',
  'frequency',
  'facilityId',
  'facilityName',
  'starred',
  'shortName',
] as const satisfies (keyof VnasPosition & keyof Position)[]

const copied = (from: VnasPosition) =>
  Object.fromEntries(COPIED.map((field) => [field, from[field]])) as Pick<
    VnasPosition,
    (typeof COPIED)[number]
  >

/**
 * Brings the Positions list in line with vNAS (decision 0060): a new position is added and a
 * changed one updated, matched on vNAS id; one gone from vNAS is retired, never deleted, and one
 * that comes back is un-retired. All of it in one transaction, after the whole answer is checked,
 * so a failure leaves the list as it was. A failure is logged and thrown.
 *
 * Runs below access: positions can't be written by hand, only by this.
 */
export async function syncPositions(req: PayloadRequest): Promise<SyncReport> {
  try {
    const fromVnas = await fetchZidPositions()
    const report = await inTransaction(req, () => apply(req, fromVnas))
    req.payload.logger.info(
      `Positions synced from vNAS: ${report.added} added, ${report.changed} changed, ${report.retired} retired.`,
    )
    return report
  } catch (error) {
    req.payload.logger.error({ err: error }, `Positions sync from vNAS failed; nothing changed.`)
    throw error
  }
}

async function apply(req: PayloadRequest, fromVnas: VnasPosition[]): Promise<SyncReport> {
  const { payload } = req
  const { docs: stored } = await payload.find({
    collection: 'positions',
    pagination: false,
    depth: 0,
    req,
  })
  const storedById = new Map(stored.map((position) => [position.vnasId, position]))
  const inVnas = new Set(fromVnas.map((position) => position.vnasId))

  // vNAS never reuses an id, but a position deleted and made again in Data Admin comes back under
  // a new id with its old callsign. The record that held the callsign, which vNAS no longer lists
  // under its own id, takes the new id, so whatever names that record keeps naming it.
  const goneByCallsign = new Map(
    stored.filter((position) => !inVnas.has(position.vnasId)).map((p) => [p.callsign, p]),
  )
  const recordFor = (position: VnasPosition) =>
    storedById.get(position.vnasId) ?? goneByCallsign.get(position.callsign)

  const update = (id: string, data: Partial<Position>) =>
    payload.update({ collection: 'positions', id, data, depth: 0, req })

  const added = fromVnas.filter((position) => !recordFor(position))
  const changed = fromVnas.flatMap((position) => {
    const existing = recordFor(position)
    if (!existing) return []
    const fields = { vnasId: position.vnasId, ...copied(position) }
    const differs =
      existing.retired === true ||
      existing.vnasId !== fields.vnasId ||
      COPIED.some((field) => (existing[field] ?? null) !== (fields[field] ?? null))
    return differs ? [{ existing, fields }] : []
  })
  const takenOver = new Set(changed.map(({ existing }) => existing.id))
  const retiring = stored.filter(
    (position) => !inVnas.has(position.vnasId) && !position.retired && !takenOver.has(position.id),
  )

  // Callsigns are unique at every step, so a position whose callsign changes first lets go of its
  // old one: vNAS may have swapped two, or given a freed one to a new position.
  for (const { existing, fields } of changed) {
    if (existing.callsign !== fields.callsign)
      await update(existing.id, { callsign: `${existing.vnasId}.syncing` })
  }
  for (const { existing, fields } of changed) {
    await update(existing.id, { ...fields, retired: false })
  }
  for (const position of added) {
    await payload.create({
      collection: 'positions',
      data: {
        vnasId: position.vnasId,
        ...copied(position),
        title: positionTitle(position),
        retired: false,
      },
      depth: 0,
      req,
    })
  }
  for (const position of retiring) await update(position.id, { retired: true })

  return { added: added.length, changed: changed.length, retired: retiring.length }
}
