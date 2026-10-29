/**
 * TEMPORARY (decision 0060): Indy's short names for positions vNAS hasn't named yet. vNAS plans to
 * publish a short name for every position in Data Admin; once it does, remove this file, the
 * `indyShortName` field and its rule in the sync, and serve `vnasShortName` alone.
 */
import type { Position } from '@/payload-types'
import { indyFact, servedFact, type RefuseOverride } from './indy-facts'
import { positionType } from './position-type'

const SUFFIX = { TWR: 'LC', GND: 'GC', DEL: 'CD' } as const

/**
 * The short name generated from the callsign's prefix, the airport (not the facility: `DAY_M_APP`
 * sits in the CMH TRACON and gives `DAY M`): a tower `SDF LC`, a ground `SDF GC`, a delivery
 * `CRW CD`, each ending `E` or `W` where the callsign's middle part is that (`SDF_E_TWR` gives
 * `SDF LC E`), and an approach or departure the prefix and its STARS TCP's sector letter
 * (`CRW_N_APP` → `CRW N`). Ramp, TMU, guard and anything else get none, as does a radar
 * position with no TCP.
 */
export function generatedShortName(position: {
  callsign: string
  tcpSectorId: string | null
}): string | null {
  const type = positionType(position.callsign)
  const prefix = position.callsign.split('_')[0]
  if (type === 'TWR' || type === 'GND' || type === 'DEL') {
    // An east or west position (`SDF_E_TWR`) ends with it; other middle parts (`CVG_C_TWR`) don't.
    const parts = position.callsign.split('_')
    const middle = parts.length === 3 ? parts[1] : null
    const side = middle === 'E' || middle === 'W' ? ` ${middle}` : ''
    return `${prefix} ${SUFFIX[type]}${side}`
  }
  if (type === 'APP' || type === 'DEP')
    return position.tcpSectorId ? `${prefix} ${position.tcpSectorId}` : null
  return null
}

const notWhereVnasNamesIt: RefuseOverride = ({ value, previousValue, position }) => {
  const vnas = position.vnasShortName
  // An override set before vNAS named the position stays stored, and vNAS's name wins.
  if (!vnas || !value || value === previousValue) return null
  return `vNAS names this position ${vnas}, so its short name can’t be overridden.`
}

/** The position's short name where vNAS has none: generated, and overridable by a CMS admin. */
export const indyShortNameField = indyFact({
  name: 'indyShortName',
  label: 'Short name (temporary, until vNAS names this position)',
  description:
    'As controllers say it: the airport and LC, GC or CD for towers, grounds and deliveries, and its STARS sector letter for approach and departure.',
  value: { type: 'text' },
  refuseOverride: notWhereVnasNamesIt,
  condition: (data) => !data?.vnasShortName,
})

/**
 * The short name served, wherever a position's short name is shown or sent: vNAS's if it has one,
 * else the override if set, else the generated value. Stored on each position as `shortName`.
 */
export const servedShortName = (
  position: Pick<Position, 'vnasShortName' | 'indyShortName'>,
): string | null => position.vnasShortName || servedFact(position.indyShortName)
