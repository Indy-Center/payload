import type { PayloadRequest } from 'payload'
import type { RowLabelLookup } from './row-label-text'

/**
 * Everything the admin's row labels look up, in one read: relationship values reach the browser as
 * ids, and one read per form is quicker than one per row. Everything is read as the signed-in
 * user.
 */
export async function buildRowLabelLookup(req: PayloadRequest): Promise<RowLabelLookup> {
  const read = { depth: 0, pagination: false, overrideAccess: false, user: req.user, req } as const
  const { payload } = req

  const [competencies, frameworks, sources, credentials] = await Promise.all([
    payload.find({
      collection: 'competencies',
      ...read,
      select: { framework: true, sourceId: true, title: true },
    }),
    payload.find({ collection: 'frameworks', ...read, select: { name: true, edition: true } }),
    payload.find({ collection: 'sources', ...read, select: { name: true, edition: true } }),
    payload.find({ collection: 'credentials', ...read, select: { code: true } }),
  ])

  const framework = new Map(frameworks.docs.map((doc) => [doc.id, doc]))
  return {
    competencies: Object.fromEntries(
      competencies.docs.flatMap((doc) => {
        const parent = framework.get(typeof doc.framework === 'string' ? doc.framework : '')
        if (!parent) return []
        const { name, edition } = parent
        return [[doc.id, { framework: name, edition, sourceId: doc.sourceId, title: doc.title }]]
      }),
    ),
    sources: Object.fromEntries(
      sources.docs.map((doc) => [doc.id, { name: doc.name, edition: doc.edition ?? null }]),
    ),
    credentials: Object.fromEntries(credentials.docs.map((doc) => [doc.id, doc.code])),
  }
}
