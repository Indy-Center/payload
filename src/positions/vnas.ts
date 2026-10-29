/**
 * Reading ZID's positions from vNAS Data Admin. Public, no key; about 1 MB, with no caching
 * headers, so the CMS reads it once a day and when a CMS admin syncs, and no other app calls it.
 */
export const VNAS_ZID_URL = 'https://data-api.vnas.vatsim.net/api/artccs/ZID'

/** One position as the CMS copies it from vNAS. */
export type VnasPosition = {
  /** vNAS's ULID, the same id its live controller feed uses. */
  vnasId: string
  callsign: string
  name: string
  radioName: string
  /** In Hz: 128225000. */
  frequency: number
  facilityId: string
  facilityName: string
  starred: boolean
  /** vNAS's own short name, from the ARTCC's ERAM sectors: "FLM 83". Null where it has none. */
  shortName: string | null
}

/** vNAS couldn't be reached, or answered with something the sync can't trust. */
export class VnasUnusable extends Error {
  name = 'VnasUnusable'
}

/** Fetches ZID's positions, or throws `VnasUnusable`. */
export async function fetchZidPositions(): Promise<VnasPosition[]> {
  let response: Response
  try {
    response = await fetch(VNAS_ZID_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw new VnasUnusable(`vNAS could not be reached: ${(error as Error).message}`)
  }
  if (!response.ok) throw new VnasUnusable(`vNAS answered ${response.status}.`)
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new VnasUnusable('vNAS answered with something that is not JSON.')
  }
  return readPositions(body)
}

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown) => typeof value === 'string' && value.trim() !== ''

/** Some radio names carry doubled or trailing spaces ("Cincinnati  Tower"). */
const tidy = (value: string) => value.trim().replace(/\s+/g, ' ')

/**
 * Every position in the response's facility tree, or `VnasUnusable` naming the first thing that
 * isn't as expected. The whole answer is checked before the sync writes anything.
 */
export function readPositions(body: unknown): VnasPosition[] {
  const unusable = (what: string) => new VnasUnusable(`vNAS answered unexpectedly: ${what}`)
  if (!isObject(body) || !isObject(body.facility)) throw unusable('no facility.')
  const artcc = body.facility
  if (artcc.id !== 'ZID') throw unusable(`the facility is ${String(artcc.id)}, not ZID.`)

  // A center position names its ERAM sector; the ARTCC's sector list holds vNAS's short name.
  // The sector's id is a number there and a string on the position.
  const eram = isObject(artcc.eramConfiguration) ? artcc.eramConfiguration : {}
  const sectors = Array.isArray(eram.sectors) ? eram.sectors : []
  const shortNames = new Map<string, string>()
  for (const sector of sectors) {
    if (isObject(sector) && text(sector.shortName) && sector.sectorId != null)
      shortNames.set(String(sector.sectorId), tidy(sector.shortName as string))
  }

  const found: VnasPosition[] = []
  const walk = (facility: unknown, where: string) => {
    if (!isObject(facility) || !text(facility.id) || !text(facility.name))
      throw unusable(`a facility under ${where} has no id or name.`)
    if (!Array.isArray(facility.positions) || !Array.isArray(facility.childFacilities))
      throw unusable(`${String(facility.id)} has no positions or child facilities.`)
    for (const position of facility.positions) {
      if (
        !isObject(position) ||
        !text(position.id) ||
        !text(position.callsign) ||
        !text(position.name) ||
        typeof position.radioName !== 'string' ||
        !Number.isInteger(position.frequency) ||
        (position.frequency as number) <= 0
      )
        throw unusable(
          `a position at ${String(facility.id)} is missing its id, callsign, name or frequency.`,
        )
      const sectorId = isObject(position.eramConfiguration)
        ? position.eramConfiguration.sectorId
        : undefined
      found.push({
        vnasId: position.id as string,
        callsign: (position.callsign as string).trim(),
        name: tidy(position.name as string),
        radioName: tidy(position.radioName),
        frequency: position.frequency as number,
        facilityId: facility.id as string,
        facilityName: tidy(facility.name as string),
        starred: position.starred === true,
        shortName: sectorId == null ? null : (shortNames.get(String(sectorId)) ?? null),
      })
    }
    for (const child of facility.childFacilities) walk(child, String(facility.id))
  }
  walk(artcc, 'ZID')

  // An empty list would retire every position: never what vNAS means.
  if (found.length === 0) throw unusable('no positions.')
  const repeated = (key: 'vnasId' | 'callsign') =>
    found.find(
      (position, index) => found.findIndex((other) => other[key] === position[key]) !== index,
    )
  const sameId = repeated('vnasId')
  if (sameId) throw unusable(`two positions share the id ${sameId.vnasId}.`)
  const sameCallsign = repeated('callsign')
  if (sameCallsign) throw unusable(`two positions share the callsign ${sameCallsign.callsign}.`)
  return found
}
