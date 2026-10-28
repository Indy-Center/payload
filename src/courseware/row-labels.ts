import type { PayloadRequest } from 'payload'
import type { RowLabelLookup } from './row-label-text'
import { loadTaskTree } from './task-tree'

/**
 * Everything the admin's row labels look up, in one read: relationship values reach the browser as
 * ids, and one read per form is quicker than one per row. Competencies, frameworks, sources and
 * credentials are read as the signed-in user. The task tree is read whole, as everywhere else
 * (tasks are readable by every signed-in account).
 */
export async function buildRowLabelLookup(req: PayloadRequest): Promise<RowLabelLookup> {
  const read = { depth: 0, pagination: false, overrideAccess: false, user: req.user, req } as const
  const { payload } = req

  const [competencies, frameworks, sources, credentials, tree] = await Promise.all([
    payload.find({
      collection: 'competencies',
      ...read,
      select: { framework: true, sourceId: true, title: true },
    }),
    payload.find({ collection: 'frameworks', ...read, select: { name: true, edition: true } }),
    payload.find({ collection: 'sources', ...read, select: { name: true, edition: true } }),
    payload.find({ collection: 'credentials', ...read, select: { code: true } }),
    loadTaskTree(req),
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
    // Retired tasks stay in the tree, so they stay labelled.
    tasks: Object.fromEntries(
      tree.inOrder.map((task) => [task.id, { number: tree.number(task.id), name: task.name }]),
    ),
    credentials: Object.fromEntries(credentials.docs.map((doc) => [doc.id, doc.code])),
  }
}
