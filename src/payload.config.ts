import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { PrivateMedia } from './collections/PrivateMedia'
import { Courses } from './collections/courseware/Courses'
import { CourseVersions } from './collections/courseware/CourseVersions'
import { LessonPlans } from './collections/courseware/LessonPlans'
import { Frameworks } from './collections/courseware/Frameworks'
import { Competencies } from './collections/courseware/Competencies'
import { Sources } from './collections/courseware/Sources'
import { Credentials } from './collections/courseware/Credentials'
import { Tasks } from './collections/courseware/Tasks'
import { GradingScales } from './collections/courseware/GradingScales'
import { Scenarios } from './collections/courseware/Scenarios'
import { Positions } from './collections/courseware/Positions'
import { PartnerCategories } from './collections/partners/PartnerCategories'
import { Partners } from './collections/partners/Partners'
import { TeacherResources } from './globals/TeacherResources'
import { coursewareEndpoints } from './courseware/endpoints'
import { IMPORT_FRAMEWORKS_PATH } from './courseware/import/form'
import { taskMoveEndpoints } from './courseware/task-move'
import { taskPickerEndpoints } from './courseware/task-picker'
import { partnersEndpoints } from './partners/endpoints'
import { positionsEndpoints } from './positions/endpoints'
import { jobs } from './positions/jobs'
import { trainingEndpoints } from './training/endpoints'
import { migrations } from './migrations'
import { storagePlugins } from './storage'
import { branding } from './branding'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      views: {
        // Opened from the Competencies list, for the Training Admin; not in the nav.
        importFrameworks: {
          Component: '/components/admin/ImportFrameworksView#ImportFrameworksView',
          path: IMPORT_FRAMEWORKS_PATH,
          exact: true,
        },
      },
    },
  },
  collections: [
    Users,
    Media,
    PrivateMedia,
    Frameworks,
    Competencies,
    Sources,
    Credentials,
    Tasks,
    GradingScales,
    Courses,
    CourseVersions,
    LessonPlans,
    Scenarios,
    Positions,
    PartnerCategories,
    Partners,
  ],
  globals: [TeacherResources],
  endpoints: [
    ...coursewareEndpoints,
    ...taskMoveEndpoints,
    ...taskPickerEndpoints,
    ...partnersEndpoints,
    ...positionsEndpoints,
    ...trainingEndpoints,
  ],
  jobs,
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    // Other systems store these ids (training-tools, Jira), and a counter gives the same number to
    // different records in different databases. A UUID stays with its record wherever it's copied.
    // Version 7 sorts by creation time.
    idType: 'uuidv7',
    // The production image has no Payload CLI to run `payload migrate` with, so the app applies new
    // migrations itself when it first connects. Development ignores these and syncs the schema live.
    prodMigrations: migrations,
  }),
  sharp,
  plugins: [...storagePlugins, branding],
})
