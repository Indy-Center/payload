import React from 'react'
import type { RelationshipFieldServerProps } from 'payload'
import { RelationshipField } from '@payloadcms/ui'
import { idOf } from '@/courseware/ids'

/**
 * A new scenario's course, as fixed text ("X-GC Example Ground Control") when "+ Add scenario" on
 * the course page's Scenarios tab set it. The value stays in the form, so a save keeps it. A
 * scenario started from the collection's own pages, with no course yet, picks one.
 */
export async function ScenarioCourse({
  clientField,
  data,
  id,
  path,
  permissions,
  readOnly,
  req,
  schemaPath,
}: RelationshipFieldServerProps) {
  const courseId = idOf(data?.course as string | { id: string } | null | undefined)
  // A saved scenario keeps the stock field, as before.
  if (!courseId || id) {
    return (
      <RelationshipField
        field={clientField}
        path={path}
        permissions={permissions}
        readOnly={readOnly}
        schemaPath={schemaPath}
      />
    )
  }
  const course = await req.payload.findByID({
    collection: 'courses',
    id: courseId,
    depth: 0,
    disableErrors: true,
    req,
    user: req.user,
    overrideAccess: false,
  })
  return (
    <div className="field-type lesson-plan-fixed">
      <span className="lesson-plan-fixed__label">Course</span>
      <p className="lesson-plan-fixed__value">
        {course ? `${course.code} ${course.title}` : 'A course no longer there'}
      </p>
    </div>
  )
}
