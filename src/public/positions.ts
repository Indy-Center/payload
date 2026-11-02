import type { PayloadRequest } from 'payload'
import type { Position } from '@/payload-types'
import { servedRequiredCredentials } from '@/positions/required-credentials'

/**
 * One of ZID's positions as the CMS copies it from vNAS Data Admin, served at
 * `/api/public/v1/positions` and in the library's catalogue (payload decision 0005): one type and
 * one mapping, so the two can't drift. A contract with apps we don't deploy, so it is written out
 * here rather than taken from `payload-types`; `publicRead` in `./read` says what may change.
 * design-system's `VnasPosition`.
 */
export type PublicPosition = {
  /** vNAS's id, the same its live controller feed uses. */
  id: string
  /** Such as `IND_83_CTR`. */
  callsign: string
  /** Such as `Falmouth 83`. */
  name: string
  /**
   * As controllers say it, such as `FLM 83`: vNAS's where it has one, else Indy's temporary one
   * (`SDF LC`, `CRW N`, or a CMS admin's override); null where there is neither.
   */
  shortName: string | null
  /** Such as `Indy Center`. */
  radioName: string
  /** In Hz: 128225000. */
  frequency: number
  /**
   * Such as `{ id: 'SDF', name: 'Louisville ATCT/TRACON', parent: { id: 'ZID', name:
   * 'Indianapolis ARTCC' } }`. `parent` is the facility it sits under in vNAS's tree (a satellite
   * tower's is its TRACON), null in ZID itself.
   */
  facility: { id: string; name: string; parent: { id: string; name: string } | null }
  /** One of its facility's main positions. */
  starred: boolean
  /**
   * Credential codes a controller must hold to work it: the CMS admin's override if set, else
   * worked out from its type. Every row must be met; a row is met by holding any one of its
   * credentials. A certification is also met by any certification ranked higher (`rank`; an A-LC
   * holder meets S-GC and A-GC), but an endorsement counts only when named. No rating is stored.
   * Apps apply this; the CMS checks nothing against it.
   */
  requiredCredentials: { anyOf: string[] }[]
  /** vNAS no longer lists it, though records may still name it. */
  retired: boolean
}

/** A stored position as served; `codeOfId` gives each credential's code by its id. */
export function toPublicPosition(
  position: Position,
  codeOfId: ReadonlyMap<string, string>,
): PublicPosition {
  return {
    id: position.vnasId,
    callsign: position.callsign,
    name: position.name,
    shortName: position.shortName || null,
    radioName: position.radioName,
    frequency: position.frequency,
    facility: {
      id: position.facilityId,
      name: position.facilityName,
      parent: position.parentFacilityId
        ? { id: position.parentFacilityId, name: position.parentFacilityName ?? '' }
        : null,
    },
    starred: position.starred ?? false,
    requiredCredentials: servedRequiredCredentials(position).map((anyOf) => ({
      anyOf: anyOf.flatMap((id) => codeOfId.get(id) ?? []),
    })),
    retired: position.retired ?? false,
  }
}

/** Every position, retired ones included, by callsign. */
export async function positionsDocument(req: PayloadRequest): Promise<PublicPosition[]> {
  const { payload } = req
  const [positions, credentials] = await Promise.all([
    payload.find({ collection: 'positions', pagination: false, depth: 0, req }),
    payload.find({
      collection: 'credentials',
      pagination: false,
      depth: 0,
      select: { code: true },
      req,
    }),
  ])
  const codeOfId = new Map(credentials.docs.map((credential) => [credential.id, credential.code]))
  return (
    positions.docs
      .map((position) => toPublicPosition(position, codeOfId))
      // By code unit, as the catalogue sorts, so the order doesn't hang on the database's collation.
      .sort((a, b) => (a.callsign < b.callsign ? -1 : a.callsign > b.callsign ? 1 : 0))
  )
}
