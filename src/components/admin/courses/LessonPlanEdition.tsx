import React from 'react'
import type { RelationshipFieldServerProps } from 'payload'
import { RelationshipField } from '@payloadcms/ui'
import { idOf } from '@/courseware/ids'

/**
 * A lesson plan's edition, as fixed text ("S-GC edition 3") once it has one: a plan is added from
 * its edition's module on the course page, which sets it. The value stays in the form, so a save
 * keeps it. A plan started from the lesson plans' own list, with no edition yet, picks one in the
 * stock field.
 */
export async function LessonPlanEdition({
  clientField,
  data,
  path,
  permissions,
  readOnly,
  req,
  schemaPath,
}: RelationshipFieldServerProps) {
  const editionId = idOf(data?.courseVersion as string | { id: string } | null | undefined)
  if (!editionId) {
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
  const edition = await req.payload.findByID({
    collection: 'course-versions',
    id: editionId,
    depth: 0,
    disableErrors: true,
    req,
    user: req.user,
    overrideAccess: false,
  })
  return (
    <div className="field-type lesson-plan-fixed">
      <span className="lesson-plan-fixed__label">Edition</span>
      <p className="lesson-plan-fixed__value">{edition?.title ?? 'An edition no longer there'}</p>
    </div>
  )
}
