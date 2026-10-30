import { APIError, ValidationError, type PayloadRequest } from 'payload'
import type { User } from '@/payload-types'
import { canAdministerTraining } from '../access'
import { importFrameworks, type ImportReport } from './import-frameworks'
import { ALL_SHEET_FILES, EDITION_FIELDS, type SheetFile } from './form'
import { NotTheSheet, parseSheets, type Sheets } from './sheets'
import { dryRunStore, requestStore } from './store'

/**
 * The admin's import page (ticket 14): the Training Admin uploads the sheet's six tabs, saved as
 * CSV, and names the USA and GCAP editions. "Check" runs the import without writing; "Import" runs
 * it as the signed-in person, through the collections' own rules. The files are read in memory and
 * never stored.
 */

export type ImportOutcome = {
  dryRun: boolean
  editions: { usa: string; gcap: string }
  report: ImportReport
}

const refuse = (faults: { path: string; message: string }[]): never => {
  throw new ValidationError({ errors: faults })
}

/** The uploaded sheets and edition names, or a refusal naming every file or name that is wrong. */
async function readUpload(
  form: FormData,
): Promise<{ sheets: Sheets; editions: { usa: string; gcap: string } }> {
  const faults: { path: string; message: string }[] = []

  const texts: Partial<Record<SheetFile, string>> = {}
  for (const file of ALL_SHEET_FILES) {
    const entry = form.get(file)
    if (entry instanceof Blob && entry.size > 0) texts[file] = await entry.text()
    else faults.push({ path: file, message: `${file} is missing.` })
  }

  const edition = (field: string) => {
    const value = form.get(field)
    return typeof value === 'string' ? value.trim() : ''
  }
  const editions = { usa: edition(EDITION_FIELDS.usa), gcap: edition(EDITION_FIELDS.gcap) }
  if (!editions.usa) {
    faults.push({ path: EDITION_FIELDS.usa, message: 'Name the USA edition, such as 2027-04.' })
  }
  if (!editions.gcap) {
    faults.push({ path: EDITION_FIELDS.gcap, message: 'Name the GCAP edition, such as 2027-04.' })
  }

  let sheets: Sheets | null = null
  if (Object.keys(texts).length === ALL_SHEET_FILES.length) {
    try {
      sheets = parseSheets(texts as Record<SheetFile, string>)
    } catch (error) {
      if (!(error instanceof NotTheSheet)) throw error
      faults.push(...error.faults.map((message) => ({ path: 'sheets', message })))
    }
  }

  if (faults.length || !sheets) return refuse(faults)
  return { sheets, editions }
}

/**
 * Checks or runs an import of the uploaded form, as the signed-in person. Only the Training Admin
 * (or the CMS admin) may; anyone else is refused before the form is read.
 */
export async function importUpload(
  req: PayloadRequest,
  { dryRun }: { dryRun: boolean },
): Promise<ImportOutcome> {
  if (!canAdministerTraining(req.user as Pick<User, 'roles' | 'cid'> | null)) {
    throw new APIError('Only the Training Admin may import framework editions.', 403)
  }
  const form = await req.formData?.().catch(() => null)
  if (!form) throw new APIError('Send the sheets as a form upload.', 400)

  const { sheets, editions } = await readUpload(form)
  const store = requestStore(req)
  const report = await importFrameworks(dryRun ? dryRunStore(store) : store, sheets, editions)
  return { dryRun, editions, report }
}
