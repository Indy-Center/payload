/**
 * What a courseware array row says when it is collapsed. Pure: the admin's row label component
 * hands it a row and the lookup, so the wording is tested without a browser.
 */

/** The facts a row's relationship ids cannot say, read once per form (see `row-labels.ts`). */
export type RowLabelLookup = {
  competencies: Record<
    string,
    { framework: string; edition: string; sourceId: string; title: string }
  >
  sources: Record<string, { name: string; edition: string | null }>
  /** Every task, retired ones too: a retired task keeps its number. */
  tasks: Record<string, { number: string; name: string }>
  /** Credential codes by id. */
  credentials: Record<string, string>
}

export type RowLabelKind =
  'mapping' | 'citation' | 'point' | 'module' | 'theoryItem' | 'practicalTask' | 'prerequisite'

/** Payload's own label for an untitled row: "Mapping 01", "Mapping 02", and so on. */
export const SINGULAR: Record<RowLabelKind, string> = {
  mapping: 'Mapping',
  citation: 'Citation',
  point: 'Point',
  module: 'Module',
  theoryItem: 'Theory item',
  practicalTask: 'Practical task',
  prerequisite: 'Prerequisite',
}

export const numberedLabel = (kind: RowLabelKind, rowNumber: number) =>
  `${SINGULAR[kind]} ${String(rowNumber + 1).padStart(2, '0')}`

type Id = string | { id: string } | null | undefined
const idOf = (value: Id) => (value && typeof value === 'object' ? value.id : (value ?? undefined))

/** Fields as the form holds them: a row being typed is missing most of them. */
export type RowData = {
  competency?: Id
  source?: Id
  /** Ticket 19 renames this to `place` and adds `title`; see `citationLabel`. */
  section?: string | null
  place?: string | null
  title?: string | null
  label?: string | null
  task?: Id
  required?: boolean | null
  anyOf?: Id[] | null
}

export type RowLabelText = { text: string; tag?: string }

const clean = (value: string | null | undefined) => value?.trim() || ''

function citationLabel(row: RowData, lookup: RowLabelLookup): RowLabelText | null {
  const source = lookup.sources[idOf(row.source) ?? '']
  if (!source) return null
  // Ticket 19 renames `section` to `place` and adds `title`: change the next line to
  // `const place = clean(row.place)`, and the title below is read from `row.title` already.
  const place = clean(row.section)
  const title = clean(row.title)
  const where = [source.name, clean(source.edition), place].filter(Boolean).join(' ')
  return { text: title ? `${where} · ${title}` : where }
}

/** The label for a row, or null while it has nothing to say (Payload's own label is shown). */
export function rowLabel(
  kind: RowLabelKind,
  row: RowData | undefined,
  lookup: RowLabelLookup | null,
): RowLabelText | null {
  if (!row) return null
  switch (kind) {
    case 'point':
      return clean(row.label) ? { text: clean(row.label) } : null
    case 'module':
      return clean(row.title) ? { text: clean(row.title) } : null
    case 'mapping': {
      const competency = lookup?.competencies[idOf(row.competency) ?? '']
      if (!competency) return null
      const { framework, edition, sourceId, title } = competency
      return { text: `${framework} ${edition} · ${sourceId} ${title}` }
    }
    case 'citation':
      return lookup ? citationLabel(row, lookup) : null
    case 'theoryItem':
    case 'practicalTask': {
      const task = lookup?.tasks[idOf(row.task) ?? '']
      if (!task) return null
      const text = `${task.number} ${task.name}`
      return kind === 'practicalTask' && row.required ? { text, tag: 'Required' } : { text }
    }
    case 'prerequisite': {
      const codes = (row.anyOf ?? [])
        .map((credential) => lookup?.credentials[idOf(credential) ?? ''])
        .filter((code): code is string => Boolean(code))
      return codes.length > 0 ? { text: `Holds one of: ${codes.join(', ')}` } : null
    }
  }
}
