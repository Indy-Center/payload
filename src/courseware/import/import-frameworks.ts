import type { SheetCompetency, Sheets } from './sheets'
import type { Store } from './store'

export type Tally = { created: string[]; changed: string[]; unchanged: number }
export type ImportReport = { usa: Tally; gcap: Tally; notes: string[] }

/** The framework names the import writes. Each edition is its own record beside the others. */
export const FRAMEWORK_NAMES = { usa: 'USA', gcap: 'GCAP' } as const

const COMPARED = [
  'title',
  'text',
  'parent',
  'sourceReference',
  'rubricTheory',
  'rubricPractical',
  'pairedGcapCode',
] as const

/** Empty and missing read the same: the CMS hands back null for a field never set. */
const same = (a: unknown, b: unknown) => (a ?? '') === (b ?? '')

/**
 * Loads one framework edition's competencies. Records are matched by framework edition and source
 * id; each is created, updated, or left alone, and the tally says which, in the sheet's order.
 */
async function importEdition(
  store: Store,
  name: string,
  edition: string,
  rows: SheetCompetency[],
): Promise<Tally> {
  const [found] = await store.findAll('frameworks', { name, edition })
  const framework = found ?? (await store.create('frameworks', { name, edition }))

  const existing = new Map(
    (await store.findAll('competencies', { framework: framework.id })).map((doc) => [
      doc.sourceId as string,
      doc,
    ]),
  )
  const ids = new Map([...existing].map(([sourceId, doc]) => [sourceId, doc.id]))

  // Parents before children, so every parent has an id by the time a child needs it.
  const depth = (row: SheetCompetency): number => {
    const parent = rows.find((candidate) => candidate.sourceId === row.parentSourceId)
    return parent ? depth(parent) + 1 : 0
  }
  const outcome = new Map<string, 'created' | 'changed' | 'unchanged'>()

  for (const row of [...rows].sort((a, b) => depth(a) - depth(b))) {
    const data = {
      framework: framework.id,
      sourceId: row.sourceId,
      title: row.title,
      text: row.text,
      parent: row.parentSourceId ? (ids.get(row.parentSourceId) ?? null) : null,
      sourceReference: row.sourceReference,
      rubricTheory: row.rubricTheory,
      rubricPractical: row.rubricPractical,
      pairedGcapCode: row.pairedGcapCode,
    }
    const current = existing.get(row.sourceId)
    if (!current) {
      ids.set(row.sourceId, (await store.create('competencies', data)).id)
      outcome.set(row.sourceId, 'created')
    } else if (COMPARED.some((field) => !same(current[field], data[field]))) {
      await store.update('competencies', current.id, data)
      outcome.set(row.sourceId, 'changed')
    } else {
      outcome.set(row.sourceId, 'unchanged')
    }
  }

  const inSheetOrder = (kind: string) =>
    rows.map((row) => row.sourceId).filter((id) => outcome.get(id) === kind)
  return {
    created: inSheetOrder('created'),
    changed: inSheetOrder('changed'),
    unchanged: inSheetOrder('unchanged').length,
  }
}

/**
 * Loads the USA and GCAP framework editions, with the rubric wording and GCAP pairing on each USA
 * competency. Running it again changes nothing that is already right.
 */
export async function importFrameworks(
  store: Store,
  sheets: Sheets,
  editions: { usa: string; gcap: string },
): Promise<ImportReport> {
  return {
    gcap: await importEdition(store, FRAMEWORK_NAMES.gcap, editions.gcap, sheets.gcap),
    usa: await importEdition(store, FRAMEWORK_NAMES.usa, editions.usa, sheets.usa),
    notes: sheets.notes,
  }
}
