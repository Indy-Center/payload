'use client'
import React, { useEffect } from 'react'
import type { ListQuery } from 'payload'
import { Button, Gutter, SearchFilter, SearchIcon, useListQuery, useStepNav } from '@payloadcms/ui'
import type { GridTask } from '@/courseware/task-grid'
import type { TaskTreeList as List } from '@/courseware/task-tree-list'
import { TaskGrid } from './TaskGrid'
import { TaskTreeTable, useOpenTasks } from './TaskTreeTable'

/**
 * The Tasks list: the task tree with a search by name, "Show retired" and "Expand all", and for
 * the Training Admin and leads an "Edit as grid" tab beside it (0022). The search, "Show retired"
 * and the tab go in the address, so the server reads the tree again with them; which tasks are
 * open stays in the browser (`useOpenTasks`).
 */
export const TaskTreeList = ({
  list,
  grid,
  mayEditGrid,
  search,
  showRetired,
  hasCreatePermission,
  newDocumentURL,
}: {
  /** The tree, unless the grid is open. */
  list: List | null
  /** The grid's tasks, when it is open. */
  grid: GridTask[] | null
  mayEditGrid: boolean
  search: string
  showRetired: boolean
  hasCreatePermission: boolean
  newDocumentURL: string
}) => {
  const { refineListData } = useListQuery()
  const { setStepNav } = useStepNav()
  useEffect(
    () => setStepNav(grid ? [{ label: 'Tasks' }, { label: 'Edit as grid' }] : [{ label: 'Tasks' }]),
    [setStepNav, grid],
  )

  // `grid` is this list's own; Payload's query keeps keys it does not know.
  const chooseTab = (toGrid: boolean) =>
    refineListData({ grid: toGrid ? 'true' : undefined } as ListQuery)

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
      {mayEditGrid ? (
        <div className="task-tree-list__tabs" role="tablist" aria-label="Tasks">
          <button
            type="button"
            role="tab"
            aria-selected={!grid}
            className="task-tree-list__tab"
            onClick={() => grid && chooseTab(false)}
          >
            Tree
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={Boolean(grid)}
            className="task-tree-list__tab"
            onClick={() => !grid && chooseTab(true)}
          >
            Edit as grid
          </button>
        </div>
      ) : null}
      {grid ? (
        // Saving reads the tasks again; a new set starts the grid afresh.
        <TaskGrid key={signature(grid)} tasks={grid} showRetired={showRetired} />
      ) : list ? (
        <TreeTab list={list} search={search} showRetired={showRetired} />
      ) : null}
    </Gutter>
  )
}

/** What the grid starts from, so a save that changed it starts the grid again. */
const signature = (tasks: GridTask[]) =>
  tasks
    .map((task) =>
      [task.id, task.parentId, task.order, task.retired, task.name, task.description].join(
        '\u0000',
      ),
    )
    .join('\u0001')

function TreeTab({
  list,
  search,
  showRetired,
}: {
  list: List
  search: string
  showRetired: boolean
}) {
  const { handleSearchChange, refineListData } = useListQuery()
  const { open, toggle, expandAll, collapseAll, allOpen } = useOpenTasks(list)

  return (
    <>
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
    </>
  )
}
