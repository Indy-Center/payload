/** The fields that put a credential in order. */
type Orderable = { code: string; kind: 'certification' | 'endorsement'; rank: number | null }

/** Certifications up the ladder, then endorsements by code. */
export function compareCredentials(a: Orderable, b: Orderable): number {
  if (a.kind !== b.kind) return a.kind === 'certification' ? -1 : 1
  return (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.code.localeCompare(b.code)
}
