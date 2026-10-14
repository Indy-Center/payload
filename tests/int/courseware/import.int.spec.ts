import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { importFrameworks } from '@/courseware/import/import-frameworks'
import { readSheets } from '@/courseware/import/sheets'
import { localStore } from '@/courseware/import/store'
import { resetCourseware, testPayload } from './helpers'

let payload: Payload

const sheetsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sheets')
const editions = { usa: 'Test edition', gcap: 'Test edition' }

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetCourseware(payload)
})

async function competency(framework: string, sourceId: string) {
  const { docs } = await payload.find({
    collection: 'competencies',
    where: { sourceId: { equals: sourceId }, 'framework.name': { equals: framework } },
    depth: 1,
  })
  return docs[0]
}

describe('importing the USA and GCAP frameworks and the rubrics', () => {
  it('creates each framework edition and its competencies, with parents', async () => {
    const report = await importFrameworks(
      localStore(payload),
      await readSheets(sheetsDir),
      editions,
    )

    expect(report.usa.created).toEqual(['1.1', '1.1.1', '1.1.1a', '4.3.3', '5.2'])
    expect(report.gcap.created).toEqual(['A.2.a.i', 'A.2.a.ii', 'A.3.b.i', 'A.4.d.i'])

    const detail = await competency('USA', '1.1.1a')
    expect(detail).toMatchObject({
      title: 'Example Detail',
      text: 'Does the detailed example thing.',
      sourceReference: '1-1-2',
    })
    expect(typeof detail.parent === 'object' && detail.parent?.sourceId).toBe('1.1.1')
    expect(await competency('USA', '1.1')).toMatchObject({ title: 'Example Heading', text: null })
    expect(await competency('GCAP', 'A.2.a.ii')).toMatchObject({
      title: 'Example Topic',
      text: 'Shows the second example understanding.',
    })
  })

  it('fixes the sheet’s known faults', async () => {
    const report = await importFrameworks(
      localStore(payload),
      await readSheets(sheetsDir),
      editions,
    )

    expect((await competency('USA', '4.3.3')).sourceReference).toBe('2-4-12')
    expect((await competency('USA', '5.2')).pairedGcapCode).toBe('A.4.d.i')
    expect((await competency('USA', '1.1.1a')).pairedGcapCode).toBe('A.2.a.ii')
    expect(report.notes).toContain(
      '4.2.5 is not in the sheet; ids are kept as VATUSA numbers them.',
    )
  })

  it('leaves out the "meets all established standards" rows', async () => {
    await importFrameworks(localStore(payload), await readSheets(sheetsDir), editions)
    expect(await competency('USA', '4.5')).toBeUndefined()
  })

  it('fills rubric theory and practical wording on USA competencies, and the GCAP pairing', async () => {
    await importFrameworks(localStore(payload), await readSheets(sheetsDir), editions)

    expect(await competency('USA', '1.1.1')).toMatchObject({
      rubricTheory: 'Does the first example thing.',
      rubricPractical: 'Does a second example thing.',
      pairedGcapCode: 'A.2.a.i',
    })
    expect(await competency('USA', '5.2')).toMatchObject({
      rubricTheory: 'Explains the example radar.',
      rubricPractical: null,
    })
  })

  it('changes nothing on a second run, and says so', async () => {
    const sheets = await readSheets(sheetsDir)
    await importFrameworks(localStore(payload), sheets, editions)

    const again = await importFrameworks(localStore(payload), sheets, editions)

    expect(again.usa).toEqual({ created: [], changed: [], unchanged: 5 })
    expect(again.gcap).toEqual({ created: [], changed: [], unchanged: 4 })
  })

  it('updates a competency that no longer matches the sheet', async () => {
    const sheets = await readSheets(sheetsDir)
    await importFrameworks(localStore(payload), sheets, editions)
    const edited = await competency('USA', '1.1.1a')
    await payload.update({ collection: 'competencies', id: edited.id, data: { title: 'Typo' } })

    const again = await importFrameworks(localStore(payload), sheets, editions)

    expect(again.usa.changed).toEqual(['1.1.1a'])
    expect((await competency('USA', '1.1.1a')).title).toBe('Example Detail')
  })
})
