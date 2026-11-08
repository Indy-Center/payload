'use client'
import React from 'react'
import { Button, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'

/**
 * Above a saved lesson plan's Tasks: "Add tasks" and "Edit as grid", both opening the lesson
 * plan's grid tab, the first with its picker showing. A lesson plan not yet saved has neither.
 */
export function LessonPlanTaskLinks() {
  const { id } = useDocumentInfo()
  const { config } = useConfig()
  if (!id) return null
  const grid = formatAdminURL({
    adminRoute: config.routes.admin,
    path: `/collections/lesson-plans/${id}/grid`,
  })
  return (
    <div className="lesson-plan-task-links">
      <Button
        el="link"
        url={`${grid}?add=true`}
        buttonStyle="secondary"
        size="small"
        margin={false}
      >
        Add tasks
      </Button>
      <Button el="link" url={grid} buttonStyle="secondary" size="small" margin={false}>
        Edit as grid
      </Button>
    </div>
  )
}
