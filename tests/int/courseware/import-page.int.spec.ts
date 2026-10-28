import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

/**
 * Importing a framework edition from the admin: the Training Admin uploads the sheet's tabs, saved
 * as CSV, and names the USA and GCAP editions. "Check" reports what an import would do without
 * writing; "Import" writes it. Driven through the endpoints as a signed-in user.
 */

let payload: Payload
let admin: User
let lead: User

const sheetsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sheets')
const FILES = [
  'usa-framework.csv',
  'gcap-codes.csv',
  'rubric-s1.csv',
  'rubric-s2.csv',
  'rubric-s3.csv',
  'rubric-c1.csv',
]

beforeAll(async () => {
  payload = await testPayload()
})

async function account(email: string, cid: string, roles: User['roles']): Promise<User> {
  return payload.create({
    collection: 'users',
    data: { email, password: 'example-password', cid, roles },
  })
}

beforeEach(async () => {
  await resetDatabase(payload)
  admin = await account('admin@example.com', '1000002', ['training:admin'])
  lead = await account('lead@example.com', '1000009', ['training:lead'])
})

/** The upload form as the browser sends it: the six made-up sheets and the two edition names. */
async function upload(
  options: {
    leaveOut?: string[]
    replace?: Record<string, string>
    usaEdition?: string
    gcapEdition?: string
  } = {},
): Promise<FormData> {
  const form = new FormData()
  for (const file of FILES) {
    if (options.leaveOut?.includes(file)) continue
    const text = options.replace?.[file] ?? (await readFile(path.join(sheetsDir, file), 'utf8'))
    form.append(file, new File([text], file, { type: 'text/csv' }))
  }
  form.append('usaEdition', options.usaEdition ?? '2027-04')
  form.append('gcapEdition', options.gcapEdition ?? '2027-04')
  return form
}

const check = async (user: User, formData: FormData) =>
  callEndpoint(payload, '/courseware/framework-import/check', {
    method: 'post',
    token: null,
    user,
    formData,
  })

const runImport = async (user: User, formData: FormData) =>
  callEndpoint(payload, '/courseware/framework-import', {
    method: 'post',
    token: null,
    user,
    formData,
  })

const messages = (body: { errors?: { message: string }[] }) =>
  (body.errors ?? []).map((error) => error.message)

const counts = async () => ({
  frameworks: (await payload.count({ collection: 'frameworks' })).totalDocs,
  competencies: (await payload.count({ collection: 'competencies' })).totalDocs,
})

describe('refusals before anything is written', () => {
  it('refuses a missing file, naming it', async () => {
    const response = await runImport(admin, await upload({ leaveOut: ['rubric-s2.csv'] }))

    expect(response.status).toBe(400)
    expect(messages(response.body)).toEqual(['rubric-s2.csv is missing.'])
    expect(await counts()).toEqual({ frameworks: 0, competencies: 0 })
  })

  it('refuses a file that is not the tab it is named for, naming it', async () => {
    const gcap = await readFile(path.join(sheetsDir, 'gcap-codes.csv'), 'utf8')
    const response = await check(admin, await upload({ replace: { 'usa-framework.csv': gcap } }))

    expect(response.status).toBe(400)
    expect(messages(response.body)).toEqual([
      'usa-framework.csv is not the sheet’s USA framework tab: its first row should start “USA ID, GCAP ID”.',
    ])
  })

  it('refuses an empty edition name, saying which', async () => {
    const response = await runImport(admin, await upload({ gcapEdition: '  ' }))

    expect(response.status).toBe(400)
    expect(messages(response.body)).toEqual(['Name the GCAP edition, such as 2027-04.'])
    expect(await counts()).toEqual({ frameworks: 0, competencies: 0 })
  })
})

describe('who may import', () => {
  it('refuses a lead, on the check and the import', async () => {
    for (const call of [check, runImport]) {
      const response = await call(lead, await upload())
      expect(response.status).toBe(403)
      expect(messages(response.body)).toEqual([
        'Only the Training Admin may import framework editions.',
      ])
    }
    expect(await counts()).toEqual({ frameworks: 0, competencies: 0 })
  })

  it('refuses someone not signed in', async () => {
    const response = await callEndpoint(payload, '/courseware/framework-import', {
      method: 'post',
      token: null,
      formData: await upload(),
    })
    expect(response.status).toBe(401)
  })
})

describe('checking and importing', () => {
  it('reports on a check what would be created, and writes nothing', async () => {
    const response = await check(admin, await upload())

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      dryRun: true,
      editions: { usa: '2027-04', gcap: '2027-04' },
      report: {
        usa: { created: ['1.1', '1.1.1', '1.1.1a', '4.3.3', '5.2'], changed: [], unchanged: 0 },
        gcap: { created: ['A.2.a.i', 'A.2.a.ii', 'A.3.b.i', 'A.4.d.i'], changed: [], unchanged: 0 },
      },
    })
    expect(response.body.report.notes).toContain(
      '4.2.5 is not in the sheet; ids are kept as VATUSA numbers them.',
    )
    expect(await counts()).toEqual({ frameworks: 0, competencies: 0 })
  })

  it('imports an edition, and a second import changes nothing', async () => {
    const first = await runImport(admin, await upload())

    expect(first.status).toBe(200)
    expect(first.body.report.usa.created).toHaveLength(5)
    expect(first.body.report.gcap.created).toHaveLength(4)
    const { docs } = await payload.find({ collection: 'frameworks', sort: 'name' })
    expect(docs.map((doc) => `${doc.name} ${doc.edition}`)).toEqual(['GCAP 2027-04', 'USA 2027-04'])
    expect(await counts()).toEqual({ frameworks: 2, competencies: 9 })

    const again = await runImport(admin, await upload())

    expect(again.body.report.usa).toEqual({ created: [], changed: [], unchanged: 5 })
    expect(again.body.report.gcap).toEqual({ created: [], changed: [], unchanged: 4 })
    expect(await counts()).toEqual({ frameworks: 2, competencies: 9 })
  })

  it('reports on a check what an import would change in an edition already in', async () => {
    await runImport(admin, await upload())
    const usa = await readFile(path.join(sheetsDir, 'usa-framework.csv'), 'utf8')
    const edited = usa.replace('Example Heading', 'Example Heading Renamed')

    const response = await check(admin, await upload({ replace: { 'usa-framework.csv': edited } }))

    expect(response.body.report.usa).toEqual({ created: [], changed: ['1.1'], unchanged: 4 })
    const { docs } = await payload.find({
      collection: 'competencies',
      where: { sourceId: { equals: '1.1' } },
    })
    expect(docs[0].title).toBe('Example Heading')
  })
})
