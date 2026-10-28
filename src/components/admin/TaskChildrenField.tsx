import React from 'react'
import type { JoinFieldServerProps } from 'payload'
import { isStaff } from '@/courseware/access'
import { loadTaskChildren } from '@/courseware/task-children'
import { TaskChildren } from './TaskChildren'

/**
 * Replaces the Children join's default table on a task's page. The children are read here, on the
 * server, for the person signed in; only the Training Admin and leads (decision 0022) get "Add
 * child". A task not yet saved has nothing beneath it to show.
 */
export async function TaskChildrenField({ id, req }: JoinFieldServerProps) {
  if (!id) return null
  const { children, retired, taskRetired } = await loadTaskChildren(req, String(id))
  return (
    <TaskChildren
      taskId={String(id)}
      rows={children}
      retired={retired}
      mayAdd={isStaff(req.user)}
      taskRetired={taskRetired}
    />
  )
}
