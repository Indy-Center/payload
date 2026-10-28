import type { RowLabelKind } from './row-label-text'

/** `admin.components.RowLabel` for a courseware array: the shared row label, told which row it is. */
export const rowLabelComponent = (kind: RowLabelKind) => ({
  path: '/components/admin/CoursewareRowLabel',
  exportName: 'CoursewareRowLabel',
  clientProps: { kind },
})
