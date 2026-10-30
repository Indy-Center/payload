'use client'
import React, { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useDocumentDrawer } from '@payloadcms/ui'

/**
 * "Add child": opens a new task in a drawer with this task as its parent. The drawer says the
 * number it will get (`TaskNextNumber`). Saving refreshes the page so the grid shows it.
 */
export const AddChildButton = ({ taskId }: { taskId: string }) => {
  const router = useRouter()
  const [Drawer, , { openDrawer }] = useDocumentDrawer({ collectionSlug: 'tasks' })
  const initialData = useMemo(() => ({ parent: taskId }), [taskId])

  return (
    <>
      <Button buttonStyle="pill" size="small" onClick={openDrawer}>
        Add child
      </Button>
      <Drawer initialData={initialData} onSave={() => router.refresh()} />
    </>
  )
}
