import React from 'react'
import { createLocalReq, type ListViewServerProps } from 'payload'
import { isStaff } from '@/courseware/access'
import { loadGridTasks } from '@/courseware/task-grid-batch'
import { loadTaskTreeList } from '@/courseware/task-tree-list'
import type { User } from '@/payload-types'
import { TaskTreeList } from './TaskTreeList'

/**
 * Replaces Payload's flat list for Tasks with the numbered task tree. The tree is read here, on
 * the server, for the person signed in, with the search and "Show retired" from the address.
 * The Training Admin and leads also get the "Edit as grid" tab (0022), read when it is open.
 */
export async function TaskTreeListView({
  payload,
  user,
  searchParams,
  hasCreatePermission,
  newDocumentURL,
}: ListViewServerProps) {
  const search = typeof searchParams?.search === 'string' ? searchParams.search : ''
  const showRetired = searchParams?.retired === 'true'
  const mayEditGrid = isStaff(user as Pick<User, 'roles' | 'cid'> | null)
  const req = await createLocalReq({ user }, payload)
  const grid = mayEditGrid && searchParams?.grid === 'true' ? await loadGridTasks(req) : null
  const list = grid ? null : await loadTaskTreeList(req, { search, showRetired })

  return (
    <TaskTreeList
      list={list}
      grid={grid}
      mayEditGrid={mayEditGrid}
      search={search}
      showRetired={showRetired}
      hasCreatePermission={hasCreatePermission}
      newDocumentURL={newDocumentURL}
    />
  )
}
