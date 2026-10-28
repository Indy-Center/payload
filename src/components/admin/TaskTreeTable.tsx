'use client'
import React, { useState } from 'react'
import { ChevronIcon, Link, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import type { TaskTreeList, TaskTreeRow } from '@/courseware/task-tree-list'

/**
 * Which tasks are open. Nothing is open at first but what a search opened; each task then opens
 * and closes on its own, `expandAll` opens every one and `collapseAll` closes them all. A new
 * search opens its parents too and leaves the rest as they were, so clearing it keeps the task
 * found in view where it sits.
 */
export function useOpenTasks(list: TaskTreeList) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(list.opened))
  const openedKey = list.opened.join(',')
  const [lastOpened, setLastOpened] = useState(openedKey)
  if (openedKey !== lastOpened) {
    setLastOpened(openedKey)
    setOpen((current) => new Set([...current, ...list.opened]))
  }

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const parents = list.rows.filter((row) => row.hasChildren).map((row) => row.id)
  const expandAll = () => setOpen(new Set(parents))
  const collapseAll = () => setOpen(new Set())
  const allOpen = parents.length > 0 && parents.every((id) => open.has(id))

  return { open, toggle, expandAll, collapseAll, allOpen }
}

/** The rows whose every parent is open, in the order given. */
export function visibleRows(rows: readonly TaskTreeRow[], open: ReadonlySet<string>) {
  const shown = new Set<string>()
  return rows.filter((row) => {
    const visible = row.parentId === null || (shown.has(row.parentId) && open.has(row.parentId))
    if (visible) shown.add(row.id)
    return visible
  })
}

/**
 * The task tree as a table of number, name and description, each task indented under its parent
 * and opened or closed by its own toggle. Choosing a task opens its page. Which tasks are open is
 * the caller's, so a list, a picker or a grid can each keep its own.
 */
export const TaskTreeTable = ({
  rows,
  open,
  onToggle,
}: {
  rows: readonly TaskTreeRow[]
  open: ReadonlySet<string>
  onToggle: (id: string) => void
}) => {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const href = (id: string) => formatAdminURL({ adminRoute, path: `/collections/tasks/${id}` })

  return (
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
          {visibleRows(rows, open).map((row) => {
            const isOpen = open.has(row.id)
            const label = `${row.number} ${row.name}`
            return (
              <tr key={row.id} className={row.retired ? 'task-tree__row--retired' : undefined}>
                <td className="task-tree__number">
                  <span
                    className="task-tree__indent"
                    style={{ paddingInlineStart: `${row.depth * 1.25}rem` }}
                  >
                    {row.hasChildren ? (
                      <button
                        type="button"
                        className="task-tree__toggle"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Close' : 'Open'} ${label}`}
                        onClick={() => onToggle(row.id)}
                      >
                        <ChevronIcon direction={isOpen ? 'down' : 'right'} size="small" />
                      </button>
                    ) : (
                      <span className="task-tree__toggle" aria-hidden="true" />
                    )}
                    <Link href={href(row.id)} className="task-tree__link" prefetch={false}>
                      {row.number}
                    </Link>
                  </span>
                </td>
                <td>
                  <Link href={href(row.id)} className="task-tree__link" prefetch={false}>
                    {row.name}
                  </Link>
                  {row.retired ? <span className="task-tree__retired">Retired</span> : null}
                </td>
                <td className="task-tree__description">{row.description}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
