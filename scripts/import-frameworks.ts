/**
 * Loads the USA and GCAP framework editions and the four rating exam rubrics into the CMS, from
 * VATUSA's competency sheet saved as CSV. Run from the engineer's machine against the deployed CMS:
 *
 *   CMS_URL=https://cms.flyindycenter.com CMS_EMAIL=… CMS_PASSWORD=… \
 *     npm run import:frameworks -- --sheets ~/vatusa-sheet --usa-edition 2026-10 --gcap-edition 2026-10
 *
 * The sheets stay outside this repository (it is public, and the wording is VATUSA's); a folder
 * inside it is refused. Running it again changes nothing that is already right.
 */
import path from 'node:path'
import { parseArgs } from 'node:util'
import { importFrameworks, type Tally } from '../src/courseware/import/import-frameworks'
import { readSheets, SHEET_FILES } from '../src/courseware/import/sheets'
import { restStore, signIn } from '../src/courseware/import/store'

const { values } = parseArgs({
  options: {
    sheets: { type: 'string' },
    'usa-edition': { type: 'string' },
    'gcap-edition': { type: 'string' },
  },
})

const fail = (message: string): never => {
  console.error(message)
  process.exit(1)
}

const sheets = values.sheets ?? fail('--sheets <folder> is required.')
const usaEdition = values['usa-edition'] ?? fail('--usa-edition is required.')
const gcapEdition = values['gcap-edition'] ?? fail('--gcap-edition is required.')
const url = process.env.CMS_URL ?? fail('Set CMS_URL, such as https://cms.flyindycenter.com.')
const email = process.env.CMS_EMAIL ?? fail('Set CMS_EMAIL to a CMS account.')
const password = process.env.CMS_PASSWORD ?? fail('Set CMS_PASSWORD.')

const repo = path.resolve(import.meta.dirname, '..')
const folder = path.resolve(sheets)
if (folder === repo || folder.startsWith(repo + path.sep)) {
  fail(`Keep the sheets outside this repository: ${folder} is inside ${repo}.`)
}

console.log(`Reading ${[SHEET_FILES.usa, SHEET_FILES.gcap, ...SHEET_FILES.rubrics].join(', ')}`)
console.log(`from ${folder}, into ${url}.`)
const report = await importFrameworks(
  restStore(url, await signIn(url, email, password)),
  await readSheets(folder),
  { usa: usaEdition, gcap: gcapEdition },
)

const show = (name: string, tally: Tally) => {
  console.log(
    `\n${name}: ${tally.created.length} created, ${tally.changed.length} changed, ${tally.unchanged} unchanged`,
  )
  if (tally.created.length) console.log(`  created: ${tally.created.join(', ')}`)
  if (tally.changed.length) console.log(`  changed: ${tally.changed.join(', ')}`)
}
show(`USA (${usaEdition})`, report.usa)
show(`GCAP (${gcapEdition})`, report.gcap)
for (const note of report.notes) console.log(`\nNote: ${note}`)
