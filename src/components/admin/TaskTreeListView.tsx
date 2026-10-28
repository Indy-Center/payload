import React from 'react'
import { createLocalReq, type ListViewServerProps } from 'payload'
import { loadTaskTreeList } from '@/courseware/task-tree-list'
import { TaskTreeList } from './TaskTreeList'

/**
 * Replaces Payload's flat list for Tasks with the numbered task tree. The tree is read here, on
 * the server, for the person signed in, with the search and "Show retired" from the address.
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
  const req = await createLocalReq({ user }, payload)
  const list = await loadTaskTreeList(req, { search, showRetired })

  return (
    <TaskTreeList
      list={list}
      search={search}
      showRetired={showRetired}
      hasCreatePermission={hasCreatePermission}
      newDocumentURL={newDocumentURL}
    />
  )
}
