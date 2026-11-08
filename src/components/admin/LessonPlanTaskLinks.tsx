'use client'
import React from 'react'
import { Button, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'

/**
 * A lesson plan's Tasks in its form: how many it holds, with "Add tasks" and "Edit as grid", both
 * opening the lesson plan's grid tab, the first with its picker showing. The tasks themselves are
 * shown and edited only there. A lesson plan not yet saved has neither link.
 */
export function LessonPlanTaskLinks() {
  const { id, savedDocumentData } = useDocumentInfo()
  const { config } = useConfig()
  const count = Array.isArray(savedDocumentData?.tasks) ? savedDocumentData.tasks.length : 0
  return (
    <div className="lesson-plan-task-links field-type">
      <span className="field-label">Tasks</span>
      {id ? (
        <>
          <p className="lesson-plan-task-links__count">
            {count === 0
              ? 'No tasks yet.'
              : `${count} ${count === 1 ? 'task' : 'tasks'}, shown on the grid.`}
          </p>
          <div className="lesson-plan-task-links__buttons">
            <Button
              el="link"
              url={`${gridURL(config.routes.admin, id)}?add=true`}
              buttonStyle="secondary"
              size="small"
              margin={false}
            >
              Add tasks
            </Button>
            <Button
              el="link"
              url={gridURL(config.routes.admin, id)}
              buttonStyle="secondary"
              size="small"
              margin={false}
            >
              Edit as grid
            </Button>
          </div>
        </>
      ) : (
        <p className="lesson-plan-task-links__count">Save the lesson plan to add its tasks.</p>
      )}
    </div>
  )
}

const gridURL = (adminRoute: string, id: string | number) =>
  formatAdminURL({ adminRoute, path: `/collections/lesson-plans/${id}/grid` })
