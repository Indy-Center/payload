'use client'
import React, { useEffect } from 'react'
import type { ListQuery } from 'payload'
import { Button, Gutter, SearchFilter, SearchIcon, useListQuery, useStepNav } from '@payloadcms/ui'
import type { TaskTreeList as List } from '@/courseware/task-tree-list'
import { TaskTreeTable, useOpenTasks } from './TaskTreeTable'

/**
 * The Tasks list: the task tree with a search by name, "Show retired" and "Expand all". The
 * search and "Show retired" go in the address, so the server reads the tree again with them;
 * which tasks are open stays in the browser (`useOpenTasks`).
 */
export const TaskTreeList = ({
  list,
  search,
  showRetired,
  hasCreatePermission,
  newDocumentURL,
}: {
  list: List
  search: string
  showRetired: boolean
  hasCreatePermission: boolean
  newDocumentURL: string
}) => {
  const { handleSearchChange, refineListData } = useListQuery()
  const { setStepNav } = useStepNav()
  useEffect(() => setStepNav([{ label: 'Tasks' }]), [setStepNav])

  const { open, toggle, expandAll, collapseAll, allOpen } = useOpenTasks(list)

  return (
    <Gutter className="task-tree-list">
      <header className="list-header">
        <div className="list-header__content">
          <div className="list-header__title-and-actions">
            <h1 className="list-header__title">Tasks</h1>
            {hasCreatePermission ? (
              <div className="list-header__title-actions">
                <Button
                  aria-label="Create new Task"
                  buttonStyle="pill"
                  el="link"
                  size="small"
                  to={newDocumentURL}
                >
                  Create New
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <div className="task-tree-list__controls">
        {/* Payload's own search box: its `search-bar` wrapper draws the box and the icon. */}
        <div className="search-bar">
          <SearchIcon />
          <SearchFilter
            label="Search by Name"
            searchQueryParam={search}
            handleChange={(value) => handleSearchChange?.(value)}
          />
        </div>
        <div className="task-tree-list__actions">
          <label className="task-tree-list__retired">
            <input
              type="checkbox"
              checked={showRetired}
              onChange={(event) =>
                // `retired` is this list's own; Payload's query keeps keys it does not know.
                refineListData({
                  retired: event.target.checked ? 'true' : undefined,
                } as ListQuery)
              }
            />
            Show retired
          </label>
          <Button
            buttonStyle="secondary"
            size="small"
            margin={false}
            onClick={allOpen ? collapseAll : expandAll}
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </Button>
        </div>
      </div>
      {list.rows.length > 0 ? (
        <TaskTreeTable rows={list.rows} open={open} onToggle={toggle} />
      ) : (
        <p className="task-tree-list__empty">
          {search ? 'No task has that in its name.' : 'No tasks yet.'}
        </p>
      )}
    </Gutter>
  )
}
