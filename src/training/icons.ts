import type { TeacherResourceIcon } from './document'

/**
 * The icons a teacher resource may carry: mdi names, each of which training-tools compiles in and
 * draws. Closed, because a name training-tools does not know draws as the link icon. Adding one is
 * a change here, in the contract, and in training-tools' `src/lib/teacher-resources.ts`.
 */
export const TEACHER_RESOURCE_ICONS = [
  { label: 'Link', value: 'link-variant' },
  { label: 'Document', value: 'file-document' },
  { label: 'Manual / SOP', value: 'book-open-variant' },
  { label: 'Google Drive', value: 'google-drive' },
  { label: 'Spreadsheet', value: 'table' },
  { label: 'Form', value: 'form-select' },
  { label: 'Video', value: 'video' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Calendar', value: 'calendar' },
  { label: 'Voice / TeamSpeak', value: 'headset' },
  { label: 'Discord', value: 'discord' },
  { label: 'Map / chart', value: 'map' },
  { label: 'Radar / vNAS', value: 'radar' },
  { label: 'Aviation', value: 'airplane' },
  { label: 'Training', value: 'school' },
  { label: 'Checklist', value: 'clipboard-text' },
  { label: 'Website', value: 'web' },
  { label: 'Help', value: 'help-circle' },
] as const satisfies readonly { label: string; value: TeacherResourceIcon }[]

// Fails to compile when the contract names an icon the Training Admin can't choose.
const everyIconListed: Exclude<
  TeacherResourceIcon,
  (typeof TEACHER_RESOURCE_ICONS)[number]['value']
> extends never
  ? true
  : never = true
void everyIconListed
