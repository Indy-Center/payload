'use client'
import React from 'react'
import { useField } from '@payloadcms/ui'

type Props = {
  path: string
  modules: { id: string; title: string }[]
  /** The module the plan sits in now, or '' for none. */
  current: string
  disabled: boolean
  note: string | null
}

/**
 * The lesson plan form's Module select. Until it is changed the form sends no module, so a save
 * leaves the outline alone; a choice sends that module's id, or '' for none.
 */
export function ModuleSelect({ path, modules, current, disabled, note }: Props) {
  const { value, setValue } = useField<string | null>({ path })
  const shown = value ?? current
  const id = `field-${path.replace(/\./g, '__')}`

  return (
    <div className="field-type lesson-plan-module">
      <label className="field-label" htmlFor={id}>
        Module
      </label>
      <select
        id={id}
        className="lesson-plan-module__select"
        value={shown}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
      >
        <option value="">Not in a module</option>
        {modules.map((module) => (
          <option key={module.id} value={module.id}>
            {module.title}
          </option>
        ))}
      </select>
      <p className="field-description">
        {note ?? 'Choosing another module moves this lesson plan to its end when you save.'}
      </p>
    </div>
  )
}
