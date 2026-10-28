/**
 * What the admin's import page and its endpoints share, and the browser may load: where the page
 * is, where it sends the form, and the form's fields. Nothing here reads files or the database.
 */

/** The import page, under the admin route. */
export const IMPORT_FRAMEWORKS_PATH = '/import-frameworks'

/** The endpoints the page posts its form to, under the API route. */
export const IMPORT_ENDPOINTS = {
  check: '/courseware/framework-import/check',
  import: '/courseware/framework-import',
} as const

/** The files the sheet's tabs are saved as. Sheets come from outside the repo, never in it. */
export const SHEET_FILES = {
  usa: 'usa-framework.csv',
  gcap: 'gcap-codes.csv',
  rubrics: ['rubric-s1.csv', 'rubric-s2.csv', 'rubric-s3.csv', 'rubric-c1.csv'],
} as const

/** Every file the import reads, in the order the page lists them. Each is a form field of its name. */
export const ALL_SHEET_FILES = [SHEET_FILES.usa, SHEET_FILES.gcap, ...SHEET_FILES.rubrics] as const
export type SheetFile = (typeof ALL_SHEET_FILES)[number]

/** The form's fields for the two edition names. */
export const EDITION_FIELDS = { usa: 'usaEdition', gcap: 'gcapEdition' } as const
