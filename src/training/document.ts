/**
 * What the CMS serves to training-tools: the contract. training-tools keeps a hand-copied type of it
 * in `src/lib/server/cms/teacher-resources.ts`.
 *
 * `GET /api/training/resources`, with training-tools' server credential in `TRAINING_API_TOKEN` as
 * a bearer token, returns the teacher resources every teacher sees on `/teach`.
 */

export type TeacherResourcesDocument = {
  /** In the Training Admin's order, which is the order they are shown in. Empty when none are set. */
  resources: TeacherResource[]
}

export type TeacherResource = {
  title: string
  /** Always `https`. */
  url: string
  newTab: boolean
}
