'use client'
import React from 'react'
import { useRowLabel } from '@payloadcms/ui'
import {
  numberedLabel,
  rowLabel,
  type RowData,
  type RowLabelKind,
} from '@/courseware/row-label-text'
import { useRowLabelLookup } from './row-label-lookup'

/**
 * Names a courseware array row by what it holds, so a collapsed row can be read without opening
 * it. Every courseware array registers this one component, saying which kind of row it labels
 * (`clientProps: { kind }`). An empty or new row keeps Payload's own label ("Mapping 03"); the
 * `row-label` class keeps Payload's styling, such as the error colour on a row that failed to save.
 */
export const CoursewareRowLabel = ({ kind }: { kind: RowLabelKind }) => {
  // Partial: a row being typed has most of its fields empty.
  const { data, rowNumber = 0 } = useRowLabel<RowData>()
  const lookup = useRowLabelLookup()
  const label = rowLabel(kind, data, lookup)
  return (
    <>
      <span className="row-label" style={{ pointerEvents: 'none' }}>
        {label?.text ?? numberedLabel(kind, rowNumber)}
      </span>
      {label?.tag && (
        <span
          style={{
            pointerEvents: 'none',
            marginInlineStart: 8,
            padding: '0 6px',
            borderRadius: 4,
            fontSize: 12,
            background: 'var(--theme-elevation-100)',
            color: 'var(--theme-elevation-800)',
          }}
        >
          {label.tag}
        </span>
      )}
    </>
  )
}
