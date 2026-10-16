import type { Payload } from 'payload'
import type { TeacherResource } from '@/payload-types'

type Row = NonNullable<TeacherResource['resources']>[number]

/** A row as saved: the icon may be left to its default. */
export type ResourceRow = Omit<Row, 'icon'> & Partial<Pick<Row, 'icon'>>

/** Saves the teacher resources past access, replacing every row. */
export const saveResources = (payload: Payload, resources: ResourceRow[]) =>
  payload.updateGlobal({ slug: 'teacher-resources', data: { resources } })
