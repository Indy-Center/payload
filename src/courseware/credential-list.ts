import type { PayloadRequest, Where } from 'payload'
import type { Credential } from '@/payload-types'
import { idOf } from './ids'

/** One credential as the Courses list's Credentials tab shows it. */
export type CredentialRow = {
  id: string
  code: string
  kind: Credential['kind']
  name: string
  rank: number | null
  grantedOnArrival: string[]
  retired: boolean
  /** The course that names it as its credential issued, worked out, not stored (0054). */
  issuedBy: { id: string; code: string } | null
}

/**
 * Every credential, as the signed-in person may read them: certifications up the ladder by rank,
 * then endorsements by code. Retired ones only when asked for.
 */
export async function loadCredentialList(
  req: PayloadRequest,
  { showRetired }: { showRetired: boolean },
): Promise<CredentialRow[]> {
  const as = { req, user: req.user, overrideAccess: false, depth: 0, pagination: false } as const
  const where: Where = showRetired ? {} : { retired: { not_equals: true } }
  const [credentials, courses] = await Promise.all([
    req.payload.find({ collection: 'credentials', where, sort: 'code', ...as }),
    req.payload.find({
      collection: 'courses',
      where: { credentialIssued: { exists: true } },
      select: { code: true, credentialIssued: true },
      ...as,
    }),
  ])
  const issuers = new Map(
    courses.docs.map((course) => [
      idOf(course.credentialIssued),
      { id: course.id, code: course.code },
    ]),
  )

  const ladder = (credential: Credential) =>
    credential.kind === 'certification' ? (credential.rank ?? Infinity) : Infinity
  return [...credentials.docs]
    .sort((a, b) => ladder(a) - ladder(b) || a.code.localeCompare(b.code))
    .map((credential) => ({
      id: credential.id,
      code: credential.code,
      kind: credential.kind,
      name: credential.name,
      rank: credential.rank ?? null,
      grantedOnArrival: credential.grantedOnArrival ?? [],
      retired: credential.retired ?? false,
      issuedBy: issuers.get(credential.id) ?? null,
    }))
}
