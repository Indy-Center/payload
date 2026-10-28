import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseCsv } from './csv'
import { ALL_SHEET_FILES, SHEET_FILES, type SheetFile } from './form'

/** One competency as the import will store it, keyed by its source id. */
export type SheetCompetency = {
  sourceId: string
  title: string
  text: string | null
  /** Source id of the parent, when the sheet has that row. */
  parentSourceId: string | null
  sourceReference: string | null
  rubricTheory: string | null
  rubricPractical: string | null
  pairedGcapCode: string | null
}

export type Sheets = { usa: SheetCompetency[]; gcap: SheetCompetency[]; notes: string[] }

export { ALL_SHEET_FILES, SHEET_FILES, type SheetFile }

/**
 * The rows that say a later rating includes the earlier ones. The order of the ratings already
 * says it, so they are not competencies (decision 0012).
 */
const MEETS_ALL_ROWS = new Set(['4.5', '5.10', '6.10'])

/** Faults in the sheet as VATUSA publishes it; see research/vatusa-competency-sheet.md. */
const REFERENCE_FIXES: Record<string, Record<string, string>> = {
  // A spreadsheet date where the same row in other ratings reads 2-4-12.
  '4.3.3': { '40943.0': '2-4-12' },
}

const NOTES = ['4.2.5 is not in the sheet; ids are kept as VATUSA numbers them.']

/**
 * A GCAP code as written: one cell is a stray link (`http://a.3.a.vi`) and one is lower case
 * (`a.4.d.ii`). Codes always start with an upper-case letter.
 */
export function cleanGcapCode(value: string): string | null {
  const code = value.trim().replace(/^https?:\/\//i, '')
  if (!code) return null
  return code[0].toUpperCase() + code.slice(1)
}

const isSectionRow = (row: string[]) => row.slice(1).every((cell) => cell.trim() === '')
const blankToNull = (value: string | undefined) => value?.trim() || null

/** `1.2.4a` → `1.2.4`; `1.2.4` → `1.2`; `1.2` → `1`. */
function usaParentId(id: string): string | null {
  if (/[a-z]$/.test(id)) return id.replace(/[a-z]+$/, '')
  const parts = id.split('.')
  return parts.length > 1 ? parts.slice(0, -1).join('.') : null
}

/** `A.2.b.ii.i` → `A.2.b.ii`. */
function gcapParentId(code: string): string | null {
  const parts = code.split('.')
  return parts.length > 1 ? parts.slice(0, -1).join('.') : null
}

/** Keeps a parent only when the sheet has that row. */
function linkParents(rows: SheetCompetency[]): SheetCompetency[] {
  const ids = new Set(rows.map((row) => row.sourceId))
  return rows.map((row) => ({
    ...row,
    parentSourceId: row.parentSourceId && ids.has(row.parentSourceId) ? row.parentSourceId : null,
  }))
}

function parseUsa(text: string): SheetCompetency[] {
  const rows: SheetCompetency[] = []
  for (const [id, gcap, reference, domain, standard] of parseCsv(text).slice(1)) {
    if (!id?.trim() || isSectionRow([id, gcap ?? '', reference ?? '', domain ?? ''])) continue
    const sourceId = id.trim()
    if (MEETS_ALL_ROWS.has(sourceId)) continue
    const rawReference = blankToNull(reference)
    rows.push({
      sourceId,
      title: domain?.trim() ?? '',
      text: blankToNull(standard),
      parentSourceId: usaParentId(sourceId),
      sourceReference: rawReference
        ? (REFERENCE_FIXES[sourceId]?.[rawReference] ?? rawReference)
        : null,
      rubricTheory: null,
      rubricPractical: null,
      pairedGcapCode: gcap ? cleanGcapCode(gcap) : null,
    })
  }
  return linkParents(rows)
}

function parseGcap(text: string): SheetCompetency[] {
  const rows: SheetCompetency[] = []
  let topic = ''
  let group = ''
  for (const [code, topicCell, standard] of parseCsv(text).slice(1)) {
    if (!code?.trim() || isSectionRow([code, topicCell ?? '', standard ?? ''])) continue
    const sourceId = cleanGcapCode(code)!
    // The topic is written once, on the first row of its group (A.2.a, A.2.b…).
    const thisGroup = sourceId.split('.').slice(0, 3).join('.')
    if (topicCell?.trim()) topic = topicCell.trim()
    else if (thisGroup !== group) topic = ''
    group = thisGroup
    rows.push({
      sourceId,
      title: topic,
      text: blankToNull(standard),
      parentSourceId: gcapParentId(sourceId),
      sourceReference: null,
      rubricTheory: null,
      rubricPractical: null,
      pairedGcapCode: null,
    })
  }
  return linkParents(rows)
}

/** Each USA id's theory and practical wording from one rubric. */
function parseRubric(text: string): Map<string, { theory: string[]; practical: string[] }> {
  const lines = new Map<string, { theory: string[]; practical: string[] }>()
  let part: 'theory' | 'practical' | null = null
  for (const row of parseCsv(text)) {
    const first = row[0]?.trim() ?? ''
    if (first === 'Theory') part = 'theory'
    else if (first === 'Practical') part = 'practical'
    else if (part && first && !MEETS_ALL_ROWS.has(first) && row[2]?.trim()) {
      const entry = lines.get(first) ?? { theory: [], practical: [] }
      entry[part].push(row[2].trim())
      lines.set(first, entry)
    }
  }
  return lines
}

/** Thrown when a file is not the tab it is named for; one message per such file. */
export class NotTheSheet extends Error {
  constructor(readonly faults: string[]) {
    super(faults.join(' '))
  }
}

const cellsOf = (row: string[] | undefined) => (row ?? []).map((cell) => cell.trim())
const startsWith = (row: string[] | undefined, wanted: string[]) =>
  wanted.every((cell, index) => cellsOf(row)[index] === cell)

/**
 * Whether a file is the tab it is named for, by the header rows VATUSA's sheet has. Says what is
 * wrong, or null.
 */
function sheetFault(file: SheetFile, text: string): string | null {
  const rows = parseCsv(text)
  if (file === SHEET_FILES.usa) {
    return startsWith(rows[0], ['USA ID', 'GCAP ID'])
      ? null
      : `${file} is not the sheet’s USA framework tab: its first row should start “USA ID, GCAP ID”.`
  }
  if (file === SHEET_FILES.gcap) {
    return startsWith(rows[0], ['GCAP Code', 'Topic'])
      ? null
      : `${file} is not the sheet’s GCAP codes tab: its first row should start “GCAP Code, Topic”.`
  }
  const header = rows.some((row) => startsWith(row, ['USA ID', 'Domain', 'Completion Standard']))
  const theory = rows.some((row) => cellsOf(row)[0] === 'Theory')
  return header && theory
    ? null
    : `${file} is not one of the sheet’s rubric tabs: it should have a “USA ID, Domain, Completion Standard” row and a “Theory” row.`
}

/**
 * Cleans the sheet's tabs, given each file's text. Refuses, with every fault, when a file is not
 * the tab it is named for.
 */
export function parseSheets(given: Record<SheetFile, string>): Sheets {
  // A byte-order mark, which some programs write when saving CSV, is not part of the first cell.
  const text = (file: SheetFile) => given[file].replace(/^﻿/, '')
  const faults = ALL_SHEET_FILES.map((file) => sheetFault(file, text(file))).filter(
    (fault): fault is string => fault !== null,
  )
  if (faults.length) throw new NotTheSheet(faults)

  const usa = parseUsa(text(SHEET_FILES.usa))
  const gcap = parseGcap(text(SHEET_FILES.gcap))

  const byId = new Map(usa.map((row) => [row.sourceId, row]))
  const notes = [...NOTES]
  for (const file of SHEET_FILES.rubrics) {
    for (const [id, wording] of parseRubric(text(file))) {
      const row = byId.get(id)
      if (!row) {
        notes.push(`${file} names ${id}, which the framework does not have; skipped.`)
        continue
      }
      if (wording.theory.length) row.rubricTheory = wording.theory.join('\n')
      if (wording.practical.length) row.rubricPractical = wording.practical.join('\n')
    }
  }
  return { usa, gcap, notes }
}

/** Reads and cleans the saved sheets in `dir`. */
export async function readSheets(dir: string): Promise<Sheets> {
  const texts = await Promise.all(
    ALL_SHEET_FILES.map(async (file) => [file, await readFile(path.join(dir, file), 'utf8')]),
  )
  return parseSheets(Object.fromEntries(texts) as Record<SheetFile, string>)
}
