'use client'
import React, { useEffect, useState } from 'react'
import type { RelationshipFieldClientComponent } from 'payload'
import { SelectInput, useConfig, useDebounce, useDocumentInfo, useField } from '@payloadcms/ui'
import type { PositionOption, PositionOptions } from '@/courseware/position-picker'

/**
 * A scenario's student and teacher position pickers, in place of Payload's relationship picker,
 * which searches and labels by one stored field. Positions read as controllers know them,
 * "FLM 83 · Falmouth 83" (or the callsign where there is no short name), and a search matches the
 * short name, name or callsign. A retired position is left out, unless the scenario already names
 * it in this same slot. The field stays a relationship, so its own check still decides what a save accepts.
 */
export const PositionPicker: RelationshipFieldClientComponent = (props) => {
  const { field, path: pathFromProps, readOnly } = props
  const { config } = useConfig()
  const { id: documentId } = useDocumentInfo()
  const { value, setValue, path, showError, disabled } = useField<string | null>({
    potentiallyStalePath: pathFromProps,
  })

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const [answer, setAnswer] = useState<PositionOptions | null>(null)
  const current = typeof value === 'string' ? value : ((value as { id?: string } | null)?.id ?? '')

  useEffect(() => {
    const query = new URLSearchParams({ search: debouncedSearch })
    if (current) query.set('current', current)
    if (documentId) query.set('scenario', String(documentId))
    query.set('slot', field.name)
    const controller = new AbortController()
    fetch(`${config.serverURL}${config.routes.api}/courseware/position-options?${query}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? (response.json() as Promise<PositionOptions>) : null))
      .then((body) => body && setAnswer(body))
      .catch(() => {
        // Aborted by the next search, or the CMS could not be reached: keep the last options.
      })
    return () => controller.abort()
  }, [config.serverURL, config.routes.api, debouncedSearch, current, documentId, field.name])

  const matched = answer?.options ?? []
  // The chosen position is labelled even when the search leaves it out.
  const all: PositionOption[] =
    answer?.selected && !matched.some((option) => option.id === answer.selected?.id)
      ? [...matched, answer.selected]
      : matched
  const shown = new Set(matched.map((option) => option.id))

  return (
    <SelectInput
      path={path}
      name={field.name}
      label={field.label}
      required={field.required}
      description={field.admin?.description}
      localized={field.localized}
      readOnly={readOnly || disabled}
      showError={showError}
      hasMany={false}
      isClearable={!field.required}
      options={all.map((option) => ({ label: option.label, value: option.id }))}
      value={current || undefined}
      placeholder="Type a short name, name or callsign"
      // The CMS has already searched; show what it found, in its order.
      filterOption={(option) => shown.has(String(option.value))}
      onInputChange={(text) => setSearch(text)}
      onChange={(option) => {
        const chosen = Array.isArray(option) ? option[0] : option
        setValue(chosen ? String(chosen.value) : null)
      }}
    />
  )
}
