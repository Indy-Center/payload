'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useDocumentDrawer } from '@payloadcms/ui'
import type { CollectionSlug } from 'payload'

/**
 * An "add" drawer that stays on the record it creates (0071): Save creates the record, closes the
 * new-record drawer and opens the created record's own drawer in its place, as clicking its name
 * does; `onSaved` runs after every save in either.
 *
 * Payload's drawer does switch itself to the record it creates, but keeps the create form's save
 * permission, worked out from the collection's access with no record: for a course author, whose
 * create access depends on the record's course, that is none, so the switched form is read-only
 * with no Save. A drawer opened on the record works its permissions out from the record.
 */
export function useAddDrawer({
  collectionSlug,
  initialData,
  onSaved,
}: {
  collectionSlug: CollectionSlug
  initialData: Record<string, unknown>
  onSaved: () => void
}) {
  const [created, setCreated] = useState<string | null>(null)
  const [NewDrawer, , { openDrawer, closeDrawer }] = useDocumentDrawer({ collectionSlug })
  const [CreatedDrawer, , { openDrawer: openCreated }] = useDocumentDrawer({
    collectionSlug,
    id: created ?? undefined,
  })
  // Opened once per record created; a later close is the user's and is left alone.
  const toOpen = useRef(false)
  useEffect(() => {
    if (created && toOpen.current) {
      toOpen.current = false
      openCreated()
    }
  }, [created, openCreated])

  const drawers = (
    <>
      <NewDrawer
        initialData={initialData}
        onSave={({ doc, operation }) => {
          if (operation === 'create') {
            toOpen.current = true
            closeDrawer()
            setCreated(String(doc.id))
          }
          onSaved()
        }}
      />
      {created && <CreatedDrawer onSave={onSaved} />}
    </>
  )
  return { openDrawer, drawers }
}
