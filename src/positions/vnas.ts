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
  vnasShortName: string | null
  /**
   * The sector letter of the position's STARS TCP ("N"), found in its facility's TCP list; null
   * where it has none. Not stored: Indy's short name is generated from it.
   */
  tcpSectorId: string | null
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
/** A string with something in it besides spaces: every copied field must be one. */
const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

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
  // The sector's id is a number there and a string on the position ("01"): compared as numbers.
  const eram = isObject(artcc.eramConfiguration) ? artcc.eramConfiguration : {}
  const sectors = Array.isArray(eram.sectors) ? eram.sectors : []
  const sectorNumber = (id: unknown) =>
    id == null || (typeof id === 'string' && id.trim() === '') ? NaN : Number(id)
  const shortNames = new Map<number, string>()
  for (const sector of sectors) {
    if (
      isObject(sector) &&
      hasText(sector.shortName) &&
      !Number.isNaN(sectorNumber(sector.sectorId))
    )
      shortNames.set(sectorNumber(sector.sectorId), tidy(sector.shortName as string))
  }

  const found: VnasPosition[] = []
  const walk = (facility: unknown, where: string) => {
    if (!isObject(facility) || !hasText(facility.id) || !hasText(facility.name))
      throw unusable(`a facility under ${where} has no id or name.`)
    if (!Array.isArray(facility.positions) || !Array.isArray(facility.childFacilities))
      throw unusable(`${String(facility.id)} has no positions or child facilities.`)
    // A radar position names its STARS TCP; the facility's TCP list holds its sector letter.
    const stars = isObject(facility.starsConfiguration) ? facility.starsConfiguration : {}
    const tcps = new Map<string, string>()
    for (const tcp of Array.isArray(stars.tcps) ? stars.tcps : []) {
      if (isObject(tcp) && hasText(tcp.id) && hasText(tcp.sectorId))
        tcps.set(tcp.id, tcp.sectorId.trim())
    }
    for (const position of facility.positions) {
      if (
        !isObject(position) ||
        !hasText(position.id) ||
        !hasText(position.callsign) ||
        !hasText(position.name) ||
        !hasText(position.radioName) ||
        !Number.isInteger(position.frequency) ||
        (position.frequency as number) <= 0
      )
        throw unusable(
          `a position at ${String(facility.id)} is missing its id, callsign, name, radio name or frequency.`,
        )
      const sectorId = isObject(position.eramConfiguration)
        ? position.eramConfiguration.sectorId
        : undefined
      const tcpId = isObject(position.starsConfiguration)
        ? position.starsConfiguration.tcpId
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
        vnasShortName: shortNames.get(sectorNumber(sectorId)) ?? null,
        tcpSectorId: typeof tcpId === 'string' ? (tcps.get(tcpId) ?? null) : null,
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
