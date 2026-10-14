/**
 * What the CMS serves to the library (and, in release 2, training-tools): the contract.
 *
 * Three reads, each with the server credential in `LIBRARY_API_TOKEN` as a bearer token:
 *
 * - `GET /api/courseware/courses` lists every course with the version numbers it has.
 * - `GET /api/courseware/courses/:code/current` or `/draft` is one whole course version, or a 404
 *   when the course has none.
 * - `GET /api/courseware/catalogue` is the task tree, frameworks, competencies and references,
 *   for task and competency pages.
 *
 * Teacher notes and course authors are included. The library decides what each reader sees;
 * nothing here is ever sent to a browser as it stands.
 */

export type CourseSummary = {
  id: string
  code: string
  title: string
  /** Identity CIDs of the course's authors. */
  authors: string[]
  /** Null until a version of the course has been published. */
  currentVersion: { id: string; number: number } | null
  /** The newest draft version, if there is one. */
  draftVersion: { id: string; number: number } | null
}

export type CourseList = { courses: CourseSummary[] }

/** One point of a grading scale, numbered from 1 in the scale's order (lowest first). */
export type GradePoint = { position: number; label: string; description: string }

/** A task as a lesson plan or scenario points at it. `number` comes from the tree, e.g. "2.3.1". */
export type TaskRef = { id: string; number: string; name: string }

export type TheoryItem = { id: string; task: TaskRef; teacherNotes: string }

export type PracticalTask = { id: string; task: TaskRef; teacherNotes: string; required: boolean }

export type Scenario = {
  id: string
  name: string
  airport: string
  /** VATUSA's format, such as `IND_GND`. */
  position: string
  difficulty: string
  mode: 'live' | 'sim'
  retired: boolean
  practicalTasks: PracticalTask[]
}

export type LessonPlan = {
  id: string
  code: string
  title: string
  description: string
  /** The rich-text body as HTML, written in the CMS. Images point at the public media store. */
  bodyHtml: string
  /** Minutes. */
  time: number | null
  isExam: boolean
  minimum: GradePoint | null
  theoryItems: TheoryItem[]
  scenarios: Scenario[]
}

export type Module = { id: string; title: string; description: string; lessonPlans: LessonPlan[] }

export type CourseVersionDocument = {
  course: { id: string; code: string; title: string; authors: string[] }
  version: {
    id: string
    number: number
    status: 'draft' | 'published'
    description: string
    /** Minutes. */
    time: number | null
    academyRequired: boolean
    updatedAt: string
  }
  scale: { id: string; name: string; points: GradePoint[] } | null
  defaultMinimum: GradePoint | null
  modules: Module[]
}

export type Framework = { id: string; name: string; edition: string }

export type Competency = {
  id: string
  frameworkId: string
  sourceId: string
  title: string
  /** Empty for a heading, which cannot be mapped to. */
  text: string
  parentId: string | null
  sourceReference: string
  rubricTheory: string
  rubricPractical: string
  /** For a USA competency, the GCAP code VATUSA pairs it with. */
  pairedGcapCode: string
}

export type Reference = {
  id: string
  name: string
  edition: string
  /** A link, or the URL of an Indy document in the public media store. */
  url: string | null
}

export type CatalogueTask = {
  id: string
  number: string
  name: string
  description: string
  parentId: string | null
  retired: boolean
  /**
   * Every competency the task is mapped to, its own and those inherited from tasks above it.
   * `fromTaskId` is the task the mapping is written on: this task's id, or an ancestor's.
   */
  mappings: { competencyId: string; fromTaskId: string }[]
  citations: { referenceId: string; section: string }[]
}

export type Catalogue = {
  frameworks: Framework[]
  competencies: Competency[]
  references: Reference[]
  /** In tree order: each task follows its parent, siblings in their order. */
  tasks: CatalogueTask[]
}
