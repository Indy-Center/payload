import type { PayloadRequest } from 'payload'
import { compareCredentials } from '@/courseware/credential-order'

/**
 * A certification sits on the ladder: it has a `rank`, and one ranked higher meets it. An
 * endorsement has no rank and counts only when named.
 */
export type CredentialKind = 'certification' | 'endorsement'

/**
 * A certification or endorsement Indy issues, as `GET /api/public/v1/credentials` serves it. A
 * contract with apps we don't deploy: it is written here, not taken from `payload-types`. It
 * describes the facility's credentials, never who holds them.
 */
export type PublicCredential = {
  /** Such as `S-GC` or `T2-CTR`. What a position's required credentials name. */
  code: string
  /** The credential's name, without the code. */
  name: string
  /** A certification (ranked on the ladder) or an endorsement (counts only when named). */
  kind: CredentialKind
  /** A certification's place on the ladder, higher above lower; null for an endorsement. */
  rank: number | null
  /** What it covers; an empty string when none is written. */
  description: string
  /** No longer issued, though records may still name it. Retired credentials are included. */
  retired: boolean
}

/** Every credential, retired included: certifications up the ladder by rank, then endorsements by code. */
export async function credentialsDocument(req: PayloadRequest): Promise<PublicCredential[]> {
  const { docs } = await req.payload.find({
    collection: 'credentials',
    pagination: false,
    depth: 0,
    req,
  })
  return docs
    .map((credential) => ({
      code: credential.code,
      name: credential.name,
      kind: credential.kind,
      rank: credential.rank ?? null,
      description: credential.description ?? '',
      retired: credential.retired ?? false,
    }))
    .sort(compareCredentials)
}
