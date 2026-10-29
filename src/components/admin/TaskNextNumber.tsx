import React from 'react'
import type { UIFieldServerProps } from 'payload'
import { idOf } from '@/courseware/ids'
import { loadTaskChildren } from '@/courseware/task-children'

/**
 * On a new task that already has a parent (the "Add child" drawer), says the number it will get.
 * Shows nothing on a saved task or a new one without a parent.
 */
export async function TaskNextNumber({ operation, data, req }: UIFieldServerProps) {
  const parentId = idOf(data?.parent as string | { id: string } | null | undefined)
  if (operation !== 'create' || !parentId) return null
  const { nextNumber } = await loadTaskChildren(req, parentId)
  if (!nextNumber) return null
  return (
    <div className="task-next-number">
      Will be <b className="task-next-number__number">{nextNumber}</b>, the last child of{' '}
      {nextNumber.split('.').slice(0, -1).join('.')}.
    </div>
  )
}
