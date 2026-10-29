'use client'
import React from 'react'
import { FieldDescription, FieldLabel, useField } from '@payloadcms/ui'
import type { DefaultCellComponentProps, NumberFieldClientProps } from 'payload'
import { megahertz } from '@/positions/frequency'

/** A position's frequency, stored in Hz, shown in MHz: "128.225". Read-only, as vNAS supplies it. */
export const FrequencyField = ({ field, path }: NumberFieldClientProps) => {
  const { value } = useField<number>({ path: path ?? field.name })
  return (
    <div className="field-type number read-only">
      <FieldLabel label={field.label ?? 'Frequency'} path={path} />
      <div className="field-type__wrap">
        <input type="text" value={megahertz(value)} disabled readOnly aria-label="Frequency" />
      </div>
      <FieldDescription description={field.admin?.description} path={path ?? field.name} />
    </div>
  )
}

export const FrequencyCell = ({ cellData }: DefaultCellComponentProps) => (
  <span>{megahertz(cellData as number | null | undefined)}</span>
)
