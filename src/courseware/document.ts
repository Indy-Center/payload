/**
 * What the CMS serves to the library (and, in release 2, training-tools): the contract.
 *
 * Three reads, each with the server credential in `LIBRARY_API_TOKEN` as a bearer token:
 *
 * - `GET /api/courseware/courses` lists every course with the version numbers it has.
 * - `GET /api/courseware/courses/:code/current` or `/draft` is one whole course version, or a 404
 *   when the course has none.
 * - `GET /api/courseware/catalogue` is the task tree, frameworks, competencies and sources,
 *   for task and competency pages, and the credentials Indy issues.
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
  /** VATUSA's format, perhaps with a sector part, such as `IND_GND` or `IND_83_CTR`. */
  studentPosition: string
  /** As `studentPosition`; null when the teacher works no position. */
  teacherPosition: string | null
  difficulty: 'easy' | 'medium' | 'hard' | null
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

export type PositionType = 'DEL' | 'GND' | 'TWR' | 'APP' | 'DEP' | 'CTR' | 'FSS'

export type CourseVersionDocument = {
  /** The course, with what a student must do before enrolling and what it involves (0054). */
  course: {
    id: string
    code: string
    title: string
    authors: string[]
    prerequisitesNote: string
    /** Hours counted across all the listed position types together; null when none is asked. */
    consolidation: { hours: number; positionTypes: PositionType[] } | null
    /** The rating exam the course ends in. */
    ratingExam: 'S1' | 'S2' | 'S3' | 'C1' | null
    /** The VATUSA Academy exam a student passes before training. */
    academyExam: 'S2' | 'S3' | 'C1' | null
    estimatedWeeks: { min: number; max: number } | null
    examOptional: boolean
    /** An https link. */
    moodleUrl: string | null
    /**
     * Credential codes a student holds before enrolling. Every row must be met; a row is met by
     * holding any one of its credentials. Retired credentials stay named.
     */
    prerequisites: { anyOf: string[] }[]
    /** The code of the credential finishing the course earns; no other course issues it. */
    credentialIssued: string | null
  }
  version: {
    id: string
    number: number
    status: 'draft' | 'published'
    description: string
    /** Minutes. */
    time: number | null
    /** What a student must do to finish this edition. */
    completionStandard: string
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

/** An outside document tasks cite (decision 0053). */
export type Source = {
  id: string
  name: string
  edition: string
  /** An https link. */
  url: string
}

/** A VATSIM controller rating that can bring a certification with it on arrival. */
export type ArrivalRating = 'S1' | 'S2' | 'S3' | 'C1' | 'C3' | 'I1' | 'I3'

/** A certification or endorsement Indy issues (decision 0054). */
export type Credential = {
  id: string
  /** Such as `S-GC` or `T2-CTR`. */
  code: string
  kind: 'certification' | 'endorsement'
  name: string
  description: string
  /** A certification's place on the ladder, higher above lower; null for an endorsement. */
  rank: number | null
  /** The ratings that grant a certification on arrival; empty for an endorsement. */
  grantedOnArrival: ArrivalRating[]
  /** No longer issued, though records may still name it. */
  retired: boolean
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
  citations: { sourceId: string; place: string; title: string | null }[]
}

export type Catalogue = {
  frameworks: Framework[]
  competencies: Competency[]
  sources: Source[]
  /** Certifications by rank, then endorsements by code, retired ones included. */
  credentials: Credential[]
  /** In tree order: each task follows its parent, siblings in their order. */
  tasks: CatalogueTask[]
}
