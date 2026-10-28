'use client'
import React from 'react'
import type { TaskChildren as Children } from '@/courseware/task-children'
import { AddChildButton } from './AddChildButton'
import { TaskChildrenGrid } from './TaskChildrenGrid'

/**
 * The Children field on a task's page: the grid, and for the Training Admin and leads an "Add
 * child" button. A retired task is not offered new children (decision 0031; the Parent picker
 * excludes it too). `AddChild` is a seam for tests: the drawer needs Payload's whole admin shell.
 */
export const TaskChildren = ({
  taskId,
  rows,
  retired,
  mayAdd,
  taskRetired,
  AddChild = AddChildButton,
}: {
  taskId: string
  rows: Children['children']
  retired: Children['retired']
  mayAdd: boolean
  taskRetired: boolean
  AddChild?: React.ComponentType<{ taskId: string }>
}) => (
  <div className="field-type task-children">
    <div className="task-children__header">
      <h4 className="task-children__title">Children</h4>
      {mayAdd && !taskRetired ? <AddChild taskId={taskId} /> : null}
    </div>
    <TaskChildrenGrid rows={rows} retired={retired} />
  </div>
)
