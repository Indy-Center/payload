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
  /** Plain text, to be drawn as text. Null when there is none, or it is blank. */
  description: string | null
  /** Always `https`. */
  url: string
  newTab: boolean
  icon: TeacherResourceIcon
}

/** mdi icon names; training-tools draws each one. Offered in `./icons`. */
export type TeacherResourceIcon =
  | 'link-variant'
  | 'file-document'
  | 'book-open-variant'
  | 'google-drive'
  | 'table'
  | 'form-select'
  | 'video'
  | 'youtube'
  | 'calendar'
  | 'headset'
  | 'discord'
  | 'map'
  | 'radar'
  | 'airplane'
  | 'school'
  | 'clipboard-text'
  | 'web'
  | 'help-circle'
