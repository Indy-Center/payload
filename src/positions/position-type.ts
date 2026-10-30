/** A position's type, read from its callsign's last part; `guard` for an emergency one. */
export type PositionType =
  'RMP' | 'DEL' | 'GND' | 'TWR' | 'APP' | 'DEP' | 'CTR' | 'TMU' | 'guard' | 'other'

const BY_SUFFIX = ['RMP', 'DEL', 'GND', 'TWR', 'APP', 'DEP', 'CTR', 'TMU'] as const

/**
 * `SDF_E_TWR` is a tower and `CRW_N_APP` an approach. A guard position carries `EM` before its
 * type (`IND_EM_CTR`, `PKB_EM_TWR`: vNAS names each "… GUARD"), whatever that type is.
 */
export function positionType(callsign: string): PositionType {
  const parts = callsign.split('_')
  if (parts.length > 2 && parts.slice(1, -1).includes('EM')) return 'guard'
  const suffix = parts.at(-1)
  return BY_SUFFIX.find((type) => type === suffix) ?? 'other'
}
