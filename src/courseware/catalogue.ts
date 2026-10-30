import type { PayloadRequest } from 'payload'
import type { Catalogue, CatalogueTask, Credential } from './document'
import { servedRequiredCredentials } from '@/positions/required-credentials'
import { idOf } from './ids'
import { loadTaskTree, type TaskTree } from './task-tree'

/**
 * The task tree, frameworks, competencies and sources, for task and competency pages, and the
 * credentials Indy issues and ZID's positions.
 */
export async function buildCatalogue(req: PayloadRequest): Promise<Catalogue> {
  const { payload } = req
  const [tree, frameworks, competencies, sources, credentials, positions] = await Promise.all([
    loadTaskTree(req),
    payload.find({ collection: 'frameworks', sort: 'name', pagination: false, depth: 0, req }),
    payload.find({ collection: 'competencies', pagination: false, depth: 0, req }),
    payload.find({ collection: 'sources', sort: 'name', pagination: false, depth: 0, req }),
    payload.find({ collection: 'credentials', pagination: false, depth: 0, req }),
    payload.find({ collection: 'positions', pagination: false, depth: 0, req }),
  ])

  const codeOfId = new Map(credentials.docs.map((credential) => [credential.id, credential.code]))

  return {
    frameworks: frameworks.docs.map((framework) => ({
      id: framework.id,
      name: framework.name,
      edition: framework.edition,
    })),
    competencies: competencies.docs
      .map((competency) => ({
        id: competency.id,
        frameworkId: idOf(competency.framework)!,
        sourceId: competency.sourceId,
        title: competency.title,
        text: competency.text ?? '',
        parentId: idOf(competency.parent),
        sourceReference: competency.sourceReference ?? '',
        rubricTheory: competency.rubricTheory ?? '',
        rubricPractical: competency.rubricPractical ?? '',
        pairedGcapCode: competency.pairedGcapCode ?? '',
      }))
      .sort((a, b) => compareSourceIds(a.sourceId, b.sourceId)),
    sources: sources.docs.map((source) => ({
      id: source.id,
      name: source.name,
      edition: source.edition ?? '',
      url: source.url,
    })),
    credentials: credentials.docs
      .map((credential) => ({
        id: credential.id,
        code: credential.code,
        kind: credential.kind,
        name: credential.name,
        description: credential.description ?? '',
        rank: credential.rank ?? null,
        grantedOnArrival: credential.grantedOnArrival ?? [],
        retired: credential.retired ?? false,
      }))
      .sort(compareCredentials),
    positions: positions.docs
      .map((position) => ({
        requiredCredentials: servedRequiredCredentials(position).map((anyOf) => ({
          anyOf: anyOf.flatMap((id) => codeOfId.get(id) ?? []),
        })),
        id: position.vnasId,
        callsign: position.callsign,
        name: position.name,
        shortName: position.shortName || null,
        radioName: position.radioName,
        frequency: position.frequency,
        facility: { id: position.facilityId, name: position.facilityName },
        starred: position.starred ?? false,
        retired: position.retired ?? false,
      }))
      // By code unit, so the order doesn't hang on the database's collation.
      .sort((a, b) => (a.callsign < b.callsign ? -1 : a.callsign > b.callsign ? 1 : 0)),
    tasks: tree.inOrder.map((task) => catalogueTask(tree, task.id)),
  }
}

function catalogueTask(tree: TaskTree, id: string): CatalogueTask {
  const task = tree.get(id)!
  // Its own mappings first, then each ancestor's from the nearest up (decision 0012).
  const mappings = [task, ...tree.ancestors(id).reverse()].flatMap((from) =>
    from.competencyIds.map((competencyId) => ({ competencyId, fromTaskId: from.id })),
  )
  return {
    id,
    number: tree.number(id),
    name: task.name,
    description: task.description,
    parentId: task.parentId,
    retired: task.retired,
    mappings,
    citations: task.citations,
  }
}

/** Certifications up the ladder, then endorsements by code. */
function compareCredentials(a: Credential, b: Credential): number {
  if (a.kind !== b.kind) return a.kind === 'certification' ? -1 : 1
  return (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.code.localeCompare(b.code)
}

/** Orders "2.1.10" after "2.1.9", and "2.1.3a" after "2.1.3". */
function compareSourceIds(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true })
}
