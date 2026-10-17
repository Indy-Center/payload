'use client'
import React from 'react'
import { useRowLabel } from '@payloadcms/ui'
import type { TeacherResource } from '@/payload-types'

type Row = NonNullable<TeacherResource['resources']>[number]

/** Payload's own label for an untitled row: "Resource 01", "Resource 02", and so on. */
const numberedLabel = (rowNumber: number) => `Resource ${String(rowNumber + 1).padStart(2, '0')}`

/**
 * Names a teacher resource's row by its title, or by its number until it has one. The
 * `row-label` class keeps Payload's styling, such as the error colour on a row that failed to save.
 */
export const TeacherResourceRowLabel = () => {
  // Partial: a row being typed has no title yet.
  const { data, rowNumber = 0 } = useRowLabel<Partial<Row>>()
  return (
    <span className="row-label" style={{ pointerEvents: 'none' }}>
      {data?.title?.trim() || numberedLabel(rowNumber)}
    </span>
  )
}
