import React from 'react'
import type { DefaultServerCellComponentProps } from 'payload'
import { idOf } from '@/courseware/ids'

/**
 * The Courses list's Live edition and Draft edition columns: "Edition 2", a dash when the course
 * has none of that kind, and "No editions" in Live for a course with none at all.
 */
export async function EditionCell({ field, rowData, payload }: DefaultServerCellComponentProps) {
  const draft = 'name' in field && field.name === 'draftEdition'
  const liveId = idOf(rowData.currentVersion)

  if (!draft && liveId) {
    const live = await payload.findByID({ collection: 'course-versions', id: liveId, depth: 0 })
    return <span>Edition {live.number}</span>
  }
  const { docs } = await payload.find({
    collection: 'course-versions',
    where: {
      course: { equals: rowData.id },
      ...(draft ? { status: { equals: 'draft' } } : {}),
    },
    sort: '-number',
    limit: 1,
    depth: 0,
  })
  if (draft) return <span>{docs[0] ? `Edition ${docs[0].number}` : '—'}</span>
  return <span>{docs.length === 0 ? 'No editions' : '—'}</span>
}
