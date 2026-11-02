import type { PublicCredential } from '@/public/credentials'
import { compareCodeUnits } from './code-unit-order'

/** The fields that put a credential in order. */
type Orderable = Pick<PublicCredential, 'code' | 'kind' | 'rank'>

/** Certifications up the ladder, then endorsements by code. */
export function compareCredentials(a: Orderable, b: Orderable): number {
  if (a.kind !== b.kind) return a.kind === 'certification' ? -1 : 1
  return (a.rank ?? Infinity) - (b.rank ?? Infinity) || compareCodeUnits(a.code, b.code)
}
