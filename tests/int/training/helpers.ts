import type { Payload } from 'payload'
import type { TeacherResource } from '@/payload-types'

/** Saves the teacher resources past access, replacing every row. */
export const saveResources = (payload: Payload, resources: TeacherResource['resources']) =>
  payload.updateGlobal({ slug: 'teacher-resources', data: { resources } })
