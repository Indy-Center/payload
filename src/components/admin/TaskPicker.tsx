'use client'
import React, { useEffect, useState } from 'react'
import type { RelationshipFieldClientComponent } from 'payload'
import { SelectInput, useConfig, useDebounce, useDocumentInfo, useField } from '@payloadcms/ui'
import type { TaskOption, TaskOptions } from '@/courseware/task-picker'

/**
 * Every task picker (a lesson plan's theory items, a scenario's practical tasks, a task's parent)
 * in place of Payload's relationship picker, which can only label and search by stored fields. A
 * task's number is never stored (0025), so the options come from the tree: "2.2.1 Taxi to
 * runway", in tree order, and a search matches the name or the number ("2.2" finds 2.2 and
 * everything beneath it). The field stays a relationship, so its `filterOptions` still decide what
 * a save accepts. On a task's own Parent picker, `excludeSelf` leaves the task out.
 */
export const TaskPicker: RelationshipFieldClientComponent = (props) => {
  const { field, path: pathFromProps, readOnly } = props
  const excludeSelf = Boolean((props as { excludeSelf?: boolean }).excludeSelf)
  const { config } = useConfig()
  const { id: documentId } = useDocumentInfo()
  const { value, setValue, path, showError, disabled } = useField<string | null>({
    potentiallyStalePath: pathFromProps,
  })

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const [answer, setAnswer] = useState<TaskOptions | null>(null)
  const current = typeof value === 'string' ? value : ((value as { id?: string } | null)?.id ?? '')

  useEffect(() => {
    const query = new URLSearchParams({ search: debouncedSearch })
    if (current) query.set('current', current)
    if (excludeSelf && documentId) query.set('exclude', String(documentId))
    const controller = new AbortController()
    fetch(`${config.serverURL}${config.routes.api}/courseware/task-options?${query}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? (response.json() as Promise<TaskOptions>) : null))
      .then((body) => body && setAnswer(body))
      .catch(() => {
        // Aborted by the next search, or the CMS could not be reached: keep the last options.
      })
    return () => controller.abort()
  }, [config.serverURL, config.routes.api, debouncedSearch, current, excludeSelf, documentId])

  const matched = answer?.options ?? []
  // The chosen task is labelled even when the search leaves it out.
  const all: TaskOption[] =
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
      placeholder="Type a name or a number"
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
