import type { PayloadRequest } from 'payload'
import { FRAMEWORK_NAMES } from './import/import-frameworks'
import { idOf } from './ids'

/** One framework edition, as a tab on the Competencies list. */
export type EditionTab = {
  id: string
  name: string
  edition: string
  /** How many competencies it holds, headings included. */
  count: number
  /**
   * When the edition's record last changed. The import never changes an edition it finds, so
   * today this is when the edition was first imported.
   */
  updatedAt: string
  /** Whether its competencies carry VATUSA's GCAP pairing: USA editions only. */
  showsPairing: boolean
}

/** One competency, as a row of the tree. */
export type TreeRow = {
  id: string
  sourceId: string
  title: string
  /** Null on an edition that does not show the pairing. */
  pairedGcapCode: string | null
  parentId: string | null
  /** 0 for a top-level competency. */
  depth: number
  hasChildren: boolean
}

export type CompetencyTree = {
  editions: EditionTab[]
  /** The edition asked for, or the first; null while there are none. */
  edition: (EditionTab & { competencies: TreeRow[] }) | null
  /** Rows whose ID or title holds the search, and the rows above them, opened to show them. */
  search: { matches: string[]; open: string[] } | null
}

/** USA, then GCAP, then any other framework by name. */
const FRAMEWORK_ORDER: string[] = [FRAMEWORK_NAMES.usa, FRAMEWORK_NAMES.gcap]
const frameworkRank = (name: string) => {
  const rank = FRAMEWORK_ORDER.indexOf(name)
  return rank === -1 ? FRAMEWORK_ORDER.length : rank
}

const byNumbers = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })

/** Frameworks in order, each one's newest edition first. */
function compareEditions(a: EditionTab, b: EditionTab): number {
  return (
    frameworkRank(a.name) - frameworkRank(b.name) ||
    byNumbers(a.name, b.name) ||
    byNumbers(b.edition, a.edition)
  )
}

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10 }
/** `iv` → 4, `ix` → 9, `xii` → 12. */
function romanValue(numeral: string): number {
  let total = 0
  for (let index = 0; index < numeral.length; index++) {
    const value = ROMAN[numeral[index]]
    const next = ROMAN[numeral[index + 1]] ?? 0
    total += value < next ? -value : value
  }
  return total
}
const isRoman = (part: string) => /^[ivx]+$/.test(part)

/**
 * The order the source's sheet lists its ids in, which the CMS does not store. USA ids are
 * numbers with a letter after the last (2.1.10 after 2.1.9, 2.1.3a after 2.1.3); GCAP codes end
 * in Roman numerals (A.2.a.ix after A.2.a.viii).
 */
export function compareSheetOrder(a: string, b: string): number {
  const left = a.split('.')
  const right = b.split('.')
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const [x, y] = [left[index], right[index]]
    const order = isRoman(x) && isRoman(y) ? romanValue(x) - romanValue(y) : byNumbers(x, y)
    if (order !== 0) return order
  }
  return left.length - right.length
}

/**
 * The framework editions, and one edition's competencies as a tree in its sheet's order, for the
 * Competencies list. Read as the signed-in person, through the collections' own access rules.
 */
export async function buildCompetencyTree(
  req: PayloadRequest,
  options: { edition?: string; search?: string } = {},
): Promise<CompetencyTree | null> {
  const { payload } = req
  const read = { pagination: false, depth: 0, overrideAccess: false, req } as const
  const [frameworks, competencies] = await Promise.all([
    payload.find({ collection: 'frameworks', ...read }),
    payload.find({
      collection: 'competencies',
      select: { framework: true, sourceId: true, title: true, parent: true, pairedGcapCode: true },
      ...read,
    }),
  ])

  const counts = new Map<string, number>()
  for (const competency of competencies.docs) {
    const frameworkId = idOf(competency.framework)!
    counts.set(frameworkId, (counts.get(frameworkId) ?? 0) + 1)
  }
  const editions: EditionTab[] = frameworks.docs
    .map((framework) => ({
      id: framework.id,
      name: framework.name,
      edition: framework.edition,
      count: counts.get(framework.id) ?? 0,
      updatedAt: framework.updatedAt,
      showsPairing: framework.name === FRAMEWORK_NAMES.usa,
    }))
    .sort(compareEditions)

  const chosen = options.edition ? editions.find((tab) => tab.id === options.edition) : editions[0]
  if (options.edition && !chosen) return null
  if (!chosen) return { editions, edition: null, search: null }

  const rows = treeRows(
    competencies.docs.filter((competency) => idOf(competency.framework) === chosen.id),
    chosen.showsPairing,
  )
  return {
    editions,
    edition: { ...chosen, competencies: rows },
    search: options.search?.trim() ? searchTree(rows, options.search.trim()) : null,
  }
}

type Stored = {
  id: string
  sourceId: string
  title: string
  parent?: string | { id: string } | null
  pairedGcapCode?: string | null
}

/** Each competency after its parent, siblings in sheet order. */
function treeRows(competencies: Stored[], showsPairing: boolean): TreeRow[] {
  const ids = new Set(competencies.map((competency) => competency.id))
  const children = new Map<string | null, Stored[]>()
  for (const competency of competencies) {
    // A parent outside this edition would hide the row, so it shows at the top instead.
    const parent = idOf(competency.parent)
    const key = parent && ids.has(parent) ? parent : null
    children.set(key, [...(children.get(key) ?? []), competency])
  }

  const rows: TreeRow[] = []
  const walk = (parentId: string | null, depth: number) => {
    const siblings = (children.get(parentId) ?? []).sort((a, b) =>
      compareSheetOrder(a.sourceId, b.sourceId),
    )
    for (const competency of siblings) {
      rows.push({
        id: competency.id,
        sourceId: competency.sourceId,
        title: competency.title,
        pairedGcapCode: showsPairing ? (competency.pairedGcapCode ?? null) : null,
        parentId,
        depth,
        hasChildren: children.has(competency.id),
      })
      walk(competency.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

/** Rows whose ID or title holds the text, ignoring case, and every row above one of them. */
function searchTree(rows: TreeRow[], text: string): { matches: string[]; open: string[] } {
  const wanted = text.toLowerCase()
  const byId = new Map(rows.map((row) => [row.id, row]))
  const matches = rows.filter(
    (row) =>
      row.sourceId.toLowerCase().includes(wanted) || row.title.toLowerCase().includes(wanted),
  )
  const open = new Set<string>()
  for (const match of matches) {
    for (let parent = match.parentId; parent; parent = byId.get(parent)?.parentId ?? null) {
      open.add(parent)
    }
  }
  return {
    matches: matches.map((row) => row.id),
    open: rows.filter((row) => open.has(row.id)).map((row) => row.id),
  }
}
