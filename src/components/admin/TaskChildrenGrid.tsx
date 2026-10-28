'use client'
import React from 'react'
import { Link, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import type { TaskChildren } from '@/courseware/task-children'

/**
 * A task's direct children as a read-only grid of number, name and description. A child with
 * tasks of its own says how many are beneath it; retired children are named in a line below, so
 * a gap in the numbers reads right. Each name opens that task's page.
 */
export const TaskChildrenGrid = ({
  rows,
  retired,
}: {
  rows: TaskChildren['children']
  retired: TaskChildren['retired']
}) => {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const href = (id: string) => formatAdminURL({ adminRoute, path: `/collections/tasks/${id}` })

  return (
    <div className="task-children__grid">
      {rows.length > 0 ? (
        <div className="task-tree">
          <table className="task-tree__table">
            <thead>
              <tr>
                <th className="task-tree__number">Number</th>
                <th>Name</th>
                <th className="task-tree__description">Description</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((child) => (
                <tr key={child.id}>
                  <td className="task-tree__number">{child.number}</td>
                  <td>
                    <Link href={href(child.id)} className="task-tree__link" prefetch={false}>
                      {child.name}
                    </Link>
                    {child.beneath > 0 ? (
                      <span className="task-children__beneath">{child.beneath} beneath</span>
                    ) : null}
                  </td>
                  <td className="task-tree__description">{child.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="task-tree-list__empty">No children yet.</p>
      )}
      {retired.length > 0 ? (
        <p className="task-children__retired">
          {retired.length} retired {retired.length === 1 ? 'child' : 'children'} hidden (
          {retired.map((child) => child.number).join(', ')})
        </p>
      ) : null}
    </div>
  )
}
