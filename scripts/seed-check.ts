/**
 * Fills an empty local database with made-up accounts and courseware, so a browser check of any
 * screen starts from the same data:
 *
 *   npx tsx scripts/seed-check.ts            # refuses a database that already has rows
 *   npx tsx scripts/seed-check.ts --reset    # empties every table first
 *
 * Runs against DATABASE_URL through the Local API, below access. Prints a JSON map of every
 * record it made (id and admin URL), then the accounts. Everything is made up: the repository is
 * public.
 *
 * To add rows for a new collection or field, add or extend its one `seed…` function below and
 * call it from `seedCheck`; each returns the records it made, keyed by a short name.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createLocalReq, getPayload, type CollectionSlug, type Payload } from 'payload'
import { publishingFaults } from '../src/courseware/publishing'
import { resetDatabase } from '../src/dev/reset-database'
import { CREDENTIALS } from '../src/migrations/20261026_030346_credentials'
import config from '../src/payload.config'
import { storedFrom } from '../src/positions/sync'
import { readPositions } from '../src/positions/vnas'

/** A record the seed made, and where the admin shows it. */
export type Made = { id: string; url: string }
/** The records of one collection, by the short name this file gives each. */
type MadeIn = Record<string, Made>
/** Everything the seed made, by collection slug. */
export type SeedMap = Record<string, MadeIn>

export const PASSWORD = 'seed-check-password'

export type SeedAccount = { email: string; cid: string; roles: string[]; password: string }
export type SeedResult = { records: SeedMap; accounts: SeedAccount[] }

const POSITIONS_FIXTURE = path.resolve(
  import.meta.dirname,
  '../tests/int/positions/fixtures/vnas-zid.json',
)

const made = (collection: string, id: string): Made => ({
  id,
  url: `/admin/collections/${collection}/${id}`,
})

/** Creates one record below access and files it under `key`. */
async function make(
  payload: Payload,
  into: MadeIn,
  collection: CollectionSlug,
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each call site is checked by the collection's own validation
  data: Record<string, any>,
): Promise<string> {
  const doc = await payload.create({ collection, data, depth: 0, overrideAccess: true })
  into[key] = made(collection, doc.id)
  return doc.id
}

/** Every collection that holds a row: a database is empty only when this is `[]`. */
async function collectionsWithRows(payload: Payload): Promise<string[]> {
  const withRows: string[] = []
  for (const { slug } of payload.config.collections) {
    // Payload's own record of applied migrations is not content, and a reset keeps it.
    if (slug.startsWith('payload-migrations')) continue
    const { totalDocs } = await payload.count({ collection: slug, overrideAccess: true })
    if (totalDocs > 0) withRows.push(slug)
  }
  return withRows
}

// ---------------------------------------------------------------------------------------------
// Accounts

const ACCOUNTS: SeedAccount[] = [
  {
    email: 'admin@example.test',
    cid: '1000001',
    roles: ['cms:admin', 'training:admin'],
    password: PASSWORD,
  },
  { email: 'lead@example.test', cid: '1000002', roles: ['training:lead'], password: PASSWORD },
  { email: 'author@example.test', cid: '1000003', roles: [], password: PASSWORD },
]
const AUTHOR_CID = '1000003'

async function seedUsers(payload: Payload): Promise<MadeIn> {
  const into: MadeIn = {}
  for (const account of ACCOUNTS) {
    await make(payload, into, 'users', account.email.split('@')[0], account)
  }
  return into
}

// ---------------------------------------------------------------------------------------------
// Credentials

/** The seven the credentials migration seeds, created only where missing, and one retired. */
const EXTRA_CREDENTIALS = [
  {
    code: 'X-OLD',
    kind: 'endorsement',
    name: 'Retired Example Endorsement',
    description: 'An endorsement Indy no longer issues.',
    rank: null,
    grantedOnArrival: [],
    retired: true,
  },
]

async function seedCredentials(payload: Payload): Promise<MadeIn> {
  const into: MadeIn = {}
  for (const credential of [...CREDENTIALS, ...EXTRA_CREDENTIALS]) {
    const { docs } = await payload.find({
      collection: 'credentials',
      where: { code: { equals: credential.code } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (docs[0]) into[credential.code] = made('credentials', docs[0].id)
    else await make(payload, into, 'credentials', credential.code, credential)
  }
  return into
}

// ---------------------------------------------------------------------------------------------
// Frameworks and competencies

async function seedFrameworks(
  payload: Payload,
): Promise<{ frameworks: MadeIn; competencies: MadeIn }> {
  const frameworks: MadeIn = {}
  const competencies: MadeIn = {}
  const usa = await make(payload, frameworks, 'frameworks', 'USA', {
    name: 'USA',
    edition: '2026-10',
  })
  const gcap = await make(payload, frameworks, 'frameworks', 'GCAP', {
    name: 'GCAP',
    edition: '2026-10',
  })

  const usaHeading = await make(payload, competencies, 'competencies', 'USA 1', {
    framework: usa,
    sourceId: '1',
    title: 'Surface operations',
  })
  await make(payload, competencies, 'competencies', 'USA 1.1', {
    framework: usa,
    sourceId: '1.1',
    title: 'Airport knowledge',
    text: 'The controller knows the airport layout and its markings.',
    parent: usaHeading,
    sourceReference: '1-1-1',
    // The pairing sits on the USA competency (decision 0011).
    pairedGcapCode: 'A.1',
  })
  await make(payload, competencies, 'competencies', 'USA 1.2', {
    framework: usa,
    sourceId: '1.2',
    title: 'Coordination',
    text: 'The controller coordinates with adjacent positions.',
    parent: usaHeading,
  })

  const gcapHeading = await make(payload, competencies, 'competencies', 'GCAP A', {
    framework: gcap,
    sourceId: 'A',
    title: 'Aerodrome control',
  })
  await make(payload, competencies, 'competencies', 'GCAP A.1', {
    framework: gcap,
    sourceId: 'A.1',
    title: 'Aerodrome layout',
    text: 'Applies knowledge of the aerodrome layout.',
    parent: gcapHeading,
  })
  await make(payload, competencies, 'competencies', 'GCAP A.2', {
    framework: gcap,
    sourceId: 'A.2',
    title: 'Handoffs',
    text: 'Hands traffic to the next controller.',
    parent: gcapHeading,
  })
  return { frameworks, competencies }
}

// ---------------------------------------------------------------------------------------------
// Sources and tasks

async function seedSources(payload: Payload): Promise<MadeIn> {
  const into: MadeIn = {}
  await make(payload, into, 'sources', 'handbook', {
    name: 'Example Controller Handbook',
    edition: '2026',
    url: 'https://example.test/handbook',
  })
  await make(payload, into, 'sources', 'airport-guide', {
    name: 'Example Airport Guide',
    url: 'https://example.test/airport-guide',
  })
  return into
}

const LONG_TASK_NAME =
  'Coordinate a departure release with the adjacent facility while holding traffic on the ground and keeping the frequency orderly through a busy push'

/** Nine tasks, three levels deep. Listed parent first; `parent` names an earlier key. */
const TASKS = [
  { key: 'R1', name: 'Airport familiarisation' },
  { key: 'R1a', name: 'Surface markings and signs', parent: 'R1' },
  { key: 'R1a1', name: 'Reading the airport diagram', parent: 'R1a' },
  { key: 'R1b', name: 'Runway and taxiway designators', parent: 'R1' },
  { key: 'R2', name: 'Clearances and readbacks' },
  { key: 'R2a', name: 'Issue an IFR clearance', parent: 'R2' },
  { key: 'R2a1', name: 'Handle a clearance amendment', parent: 'R2a', retired: true },
  { key: 'R2b', name: LONG_TASK_NAME, parent: 'R2' },
  { key: 'R3', name: 'Coordination and handoffs' },
]

async function seedTasks(payload: Payload, competencies: MadeIn, sources: MadeIn): Promise<MadeIn> {
  const into: MadeIn = {}
  // Two tasks carry mappings and citations (a place and a title).
  const extras: Record<string, object> = {
    R1b: {
      mappings: [{ competency: competencies['USA 1.1'].id }],
      citations: [
        { source: sources.handbook.id, place: '3-7-2.a', title: 'Runway and taxiway markings' },
      ],
    },
    R3: {
      mappings: [
        { competency: competencies['USA 1.2'].id },
        { competency: competencies['GCAP A.1'].id },
      ],
      citations: [
        {
          source: sources['airport-guide'].id,
          place: '2.4',
          title: 'Handing traffic to the tower',
        },
        { source: sources.handbook.id, place: '5-4-1', title: 'Coordination between positions' },
      ],
    },
  }
  for (const task of TASKS) {
    await make(payload, into, 'tasks', task.key, {
      name: task.name,
      parent: task.parent ? into[task.parent].id : undefined,
      retired: task.retired ?? false,
      ...extras[task.key],
    })
  }
  return into
}

// ---------------------------------------------------------------------------------------------
// Grading scale

async function seedGradingScales(payload: Payload): Promise<MadeIn> {
  const into: MadeIn = {}
  await make(payload, into, 'grading-scales', 'three-point', {
    name: 'Three-point scale',
    points: [
      { label: 'Needs work', description: 'Not yet at the standard.' },
      { label: 'Meets standard', description: 'At the standard.' },
      { label: 'Exceeds standard', description: 'Above the standard.' },
    ],
  })
  return into
}

// ---------------------------------------------------------------------------------------------
// Courses, editions, lesson plans and scenarios

const DEFAULT_MINIMUM = 2

type Ctx = {
  payload: Payload
  credentials: MadeIn
  tasks: MadeIn
  scales: MadeIn
  positions: MadeIn
}

type Courseware = Record<'courses' | 'course-versions' | 'lesson-plans' | 'scenarios', MadeIn>

/**
 * X-GC (two editions, two scenarios) and X-TWR (no editions). The scenarios pick positions: one
 * shown by short name (IND_83_CTR, "FLM 83 · Falmouth 83"), the others by callsign, and PKB_TWR,
 * which `seedPositions` retires afterwards, so a scenario names a retired position.
 */
async function seedCourses({
  payload,
  credentials,
  tasks,
  scales,
  positions,
}: Ctx): Promise<Courseware> {
  const out: Courseware = { courses: {}, 'course-versions': {}, 'lesson-plans': {}, scenarios: {} }
  const scale = scales['three-point'].id

  const course = await make(payload, out.courses, 'courses', 'X-GC', {
    code: 'X-GC',
    title: 'Example Ground Control',
    authors: [AUTHOR_CID],
    prerequisites: [
      { anyOf: [credentials['S-LC'].id] },
      { anyOf: [credentials['A-LC'].id, credentials['T-RC'].id] },
    ],
    credentialIssued: credentials['S-GC'].id,
  })
  await make(payload, out.courses, 'courses', 'X-TWR', {
    code: 'X-TWR',
    title: 'Example Tower, self-led',
    estimatedWeeks: { min: 4, max: 8 },
  })

  // Scenarios first: a lesson plan offers them. Exactly one practical task is required.
  const scenarioOne = await make(payload, out.scenarios, 'scenarios', 'ground-push', {
    course,
    name: 'Example ground push',
    airport: 'KIND',
    studentPosition: positions.LOU_TWR.id,
    teacherPosition: positions.SDF_D_APP.id,
    difficulty: 'easy',
    mode: 'sim',
    practicalTasks: [
      { task: tasks.R3.id, teacherNotes: 'Pose a handoff to the tower.', required: true },
      { task: tasks.R1b.id, teacherNotes: 'Ask for a taxi route.', required: false },
    ],
  })
  const scenarioTwo = await make(payload, out.scenarios, 'scenarios', 'departure-release', {
    course,
    name: 'Example departure release',
    airport: 'KIND',
    studentPosition: positions.IND_83_CTR.id,
    teacherPosition: positions.PKB_TWR.id,
    difficulty: 'medium',
    mode: 'live',
    practicalTasks: [{ task: tasks.R2b.id, teacherNotes: 'Hold the push.', required: false }],
  })

  // Numbered on save: the first created is edition 1.
  const edition = (key: string) =>
    make(payload, out['course-versions'], 'course-versions', key, {
      course,
      description: 'Made-up edition.',
      time: 600,
      completionStandard: 'Finish every lesson plan at its minimum grade.',
      gradingScale: scale,
      defaultMinimum: DEFAULT_MINIMUM,
    })

  // Edition 1: two modules, three lesson plans, published.
  const first = await edition('X-GC edition 1')
  const plan = (key: string, version: string, data: object) =>
    make(payload, out['lesson-plans'], 'lesson-plans', key, {
      courseVersion: version,
      time: 45,
      ...data,
    })
  const lessonOne = await plan('X-GC-1', first, {
    code: 'X-GC-1',
    title: 'Finding your way around',
    theoryItems: [
      { task: tasks.R1a1.id, teacherNotes: 'Ask where the hold-short lines are.' },
      { task: tasks.R1b.id },
    ],
  })
  const lessonTwo = await plan('X-GC-2', first, {
    code: 'X-GC-2',
    title: 'Issuing clearances',
    minimum: 3,
    theoryItems: [{ task: tasks.R2b.id }],
  })
  const lessonThree = await plan('X-GC-3', first, {
    code: 'X-GC-3',
    title: 'Putting it together',
    theoryItems: [{ task: tasks.R3.id }],
    scenarios: [scenarioOne, scenarioTwo],
  })
  await payload.update({
    collection: 'course-versions',
    id: first,
    data: {
      modules: [
        { title: 'Getting started', lessonPlans: [lessonOne, lessonTwo] },
        { title: 'Working traffic', lessonPlans: [lessonThree] },
      ],
      status: 'published',
    },
    depth: 0,
    overrideAccess: true,
  })

  // Edition 2: a draft that passes the publishing check.
  const second = await edition('X-GC edition 2')
  const draftPlan = await plan('X-GC-1 (edition 2)', second, {
    code: 'X-GC-1',
    title: 'Finding your way around, revised',
    theoryItems: [{ task: tasks.R1b.id }, { task: tasks.R3.id }],
    scenarios: [scenarioOne],
  })
  await payload.update({
    collection: 'course-versions',
    id: second,
    data: { modules: [{ title: 'Getting started', lessonPlans: [draftPlan] }] },
    depth: 0,
    overrideAccess: true,
  })

  const faults = await publishingFaults(
    await createLocalReq({}, payload),
    await payload.findByID({ collection: 'course-versions', id: second, depth: 0 }),
  )
  if (faults.length > 0) throw new Error(`The draft edition would not publish: ${faults.join(' ')}`)
  return out
}

// ---------------------------------------------------------------------------------------------
// Positions

/** A CMS admin's short name, in place of the generated `SDF D`. */
const SHORT_NAME_OVERRIDES: Record<string, string> = { SDF_D_APP: 'SDF DR' }

/**
 * A CMS admin's required credentials, in place of the generated ones: each row is the codes of
 * "holds one of these". The fixture has no ground, so an S-LC holder may work SDF_E_TWR, and
 * IND_83_CTR drops its T2-CTR row.
 */
const REQUIRED_CREDENTIAL_OVERRIDES: Record<string, string[][]> = {
  SDF_E_TWR: [['S-LC', 'A-LC']],
  IND_83_CTR: [['E-RC']],
}

/**
 * The seven in the sync's test fixture, stored as the sync stores them, none retired yet.
 * IND_83_CTR has vNAS's short name, the towers their generated ones, and SDF_D_APP an override;
 * SDF_E_TWR and IND_83_CTR have required credentials overrides.
 */
async function seedPositions(payload: Payload, credentials: MadeIn): Promise<MadeIn> {
  const into: MadeIn = {}
  const fromVnas = readPositions(JSON.parse(readFileSync(POSITIONS_FIXTURE, 'utf8')))
  const credentialIds = new Map(Object.entries(credentials).map(([code, made]) => [code, made.id]))
  for (const position of fromVnas) {
    const stored = storedFrom(position, credentialIds)
    const rows = REQUIRED_CREDENTIAL_OVERRIDES[position.callsign]
    await make(payload, into, 'positions', position.callsign, {
      ...stored,
      indyShortName: {
        ...stored.indyShortName,
        override: SHORT_NAME_OVERRIDES[position.callsign] ?? null,
      },
      indyRequiredCredentials: {
        ...stored.indyRequiredCredentials,
        override: rows?.map((codes) => ({ anyOf: codes.map((code) => credentialIds.get(code)!) })),
      },
      // The collection's hook sets the title and the short name served.
      title: '',
      retired: false,
    })
  }
  return into
}

/**
 * Retires PKB_TWR, the fixture's last position, as the sync does when vNAS drops one. It runs
 * after the scenarios are made, since a scenario can only newly pick a live position.
 */
async function retireDroppedPosition(payload: Payload, positions: MadeIn): Promise<void> {
  await payload.update({
    collection: 'positions',
    id: positions.PKB_TWR.id,
    data: { retired: true },
    depth: 0,
    overrideAccess: true,
  })
}

// ---------------------------------------------------------------------------------------------

/**
 * Seeds the database `payload` is connected to. Refuses one that has rows unless `reset`, which
 * empties it first.
 */
export async function seedCheck(
  payload: Payload,
  { reset = false }: { reset?: boolean } = {},
): Promise<SeedResult> {
  if (reset) await resetDatabase(payload)
  else {
    const withRows = await collectionsWithRows(payload)
    if (withRows.length > 0)
      throw new Error(
        `The database already has rows (${withRows.join(', ')}). Run with --reset to empty it first.`,
      )
  }

  const records: SeedMap = {}
  records.users = await seedUsers(payload)
  records.credentials = await seedCredentials(payload)
  const { frameworks, competencies } = await seedFrameworks(payload)
  records.frameworks = frameworks
  records.competencies = competencies
  records.sources = await seedSources(payload)
  records.tasks = await seedTasks(payload, competencies, records.sources)
  records['grading-scales'] = await seedGradingScales(payload)
  records.positions = await seedPositions(payload, records.credentials)
  Object.assign(
    records,
    await seedCourses({
      payload,
      credentials: records.credentials,
      tasks: records.tasks,
      scales: records['grading-scales'],
      positions: records.positions,
    }),
  )
  await retireDroppedPosition(payload, records.positions)
  return { records, accounts: ACCOUNTS }
}

async function main() {
  const args = process.argv.slice(2)
  const unknown = args.filter((arg) => arg !== '--reset')
  if (unknown.length > 0) {
    console.error(`Unknown argument ${unknown[0]}. Only --reset is understood.`)
    process.exit(1)
  }
  const payload = await getPayload({ config: await config })
  try {
    const { records, accounts } = await seedCheck(payload, { reset: args.includes('--reset') })
    console.log(JSON.stringify(records, null, 2))
    console.log('\nAccounts (all with the same password):')
    for (const account of accounts)
      console.log(
        `  ${account.email}  CID ${account.cid}  ${account.roles.join(', ') || 'course author'}  ${account.password}`,
      )
  } catch (error) {
    console.error((error as Error).message)
    process.exitCode = 1
  }
  await payload.destroy()
  // Payload leaves handles open that would keep the process waiting.
  process.exit()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
