'use client'
import { useRowLabel } from '@payloadcms/ui'

/** Names a teacher resource's row by its title, or by its number until it has one. */
export function TeacherResourceRowLabel() {
  const { data, rowNumber = 0 } = useRowLabel<{ title?: string | null }>()
  return <>{data?.title?.trim() || `Resource ${String(rowNumber + 1).padStart(2, '0')}`}</>
}
