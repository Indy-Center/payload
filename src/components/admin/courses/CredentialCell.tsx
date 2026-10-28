import React from 'react'
import type { DefaultServerCellComponentProps } from 'payload'
import { idOf } from '@/courseware/ids'

/**
 * The Courses list's Credential issued column: the credential's code, or a dash when the course
 * issues none, as the edition columns read. The read skips access for the reason `EditionCell`
 * gives: every signed-in account may read credentials, and the list is signed-in only.
 */
export async function CredentialCell({ cellData, payload }: DefaultServerCellComponentProps) {
  const id = idOf(cellData as string | { id: string } | null | undefined)
  if (!id) return <span>—</span>
  const credential = await payload.findByID({
    collection: 'credentials',
    id,
    depth: 0,
    disableErrors: true,
  })
  return <span>{credential?.code ?? '—'}</span>
}
