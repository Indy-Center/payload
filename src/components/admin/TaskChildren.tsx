'use client'
import React, { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useDocumentDrawer } from '@payloadcms/ui'
import type { TaskChildren as Children } from '@/courseware/task-children'
import { TaskChildrenGrid } from './TaskChildrenGrid'

/**
 * The Children field on a task's page: the grid, and for the Training Admin and leads an "Add
 * child" button that opens a new task in a drawer with this task as its parent. The drawer says
 * the number it will get (`TaskNextNumber`). Saving refreshes the page so the grid shows it.
 */
export const TaskChildren = ({
  taskId,
  rows,
  retired,
  mayAdd,
}: {
  taskId: string
  rows: Children['children']
  retired: Children['retired']
  mayAdd: boolean
}) => {
  const router = useRouter()
  const [Drawer, , { openDrawer }] = useDocumentDrawer({ collectionSlug: 'tasks' })
  const initialData = useMemo(() => ({ parent: taskId }), [taskId])

  return (
    <div className="field-type task-children">
      <div className="task-children__header">
        <h4 className="task-children__title">Children</h4>
        {mayAdd ? (
          <>
            <Button buttonStyle="pill" size="small" onClick={openDrawer}>
              Add child
            </Button>
            <Drawer initialData={initialData} onSave={() => router.refresh()} />
          </>
        ) : null}
      </div>
      <TaskChildrenGrid rows={rows} retired={retired} />
    </div>
  )
}
