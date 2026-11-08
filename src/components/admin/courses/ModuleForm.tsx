'use client'
import React, { useId, useState } from 'react'
import { Button } from '@payloadcms/ui'
import { LeaveGuard } from '../LeaveGuard'

export type ModuleWording = { title: string; description: string }

type Props = {
  /** The module as saved; empty for a new one. */
  saved: ModuleWording
  /** A module added with "+ Add module" and not saved yet: it counts as a change from the start. */
  isNew: boolean
  /** Saves the wording; resolves true once saved, false when refused (the form stays open). */
  onSave: (wording: ModuleWording) => Promise<boolean>
  onCancel: () => void
}

/**
 * One module's Title and Description, opened in place on the Content tab with Save and Cancel
 * (one module at a time). While it holds changes, the shared guard asks before leaving the page
 * and before anything that calls `confirmLeave`, such as another module's Edit.
 */
export function ModuleForm({ saved, isNew, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(saved.title)
  const [description, setDescription] = useState(saved.description)
  const [saving, setSaving] = useState(false)
  const id = useId()
  const dirty = isNew || title !== saved.title || description !== saved.description

  const save = async () => {
    setSaving(true)
    const done = await onSave({ title, description })
    // Once saved the form is gone; a refused save keeps it, and its changes.
    if (!done) setSaving(false)
  }

  return (
    <div className="edition-outline__module-form">
      <LeaveGuard unsaved={dirty && !saving} />
      <div className="field-type">
        <label className="field-label" htmlFor={`${id}-title`}>
          Title <span className="required">*</span>
        </label>
        <input
          id={`${id}-title`}
          className="edition-outline__input"
          name="title"
          value={title}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="field-type">
        <label className="field-label" htmlFor={`${id}-description`}>
          Description
        </label>
        <textarea
          id={`${id}-description`}
          className="edition-outline__input"
          name="description"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="edition-outline__actions">
        <Button buttonStyle="secondary" margin={false} size="small" onClick={onCancel}>
          Cancel
        </Button>
        <Button margin={false} size="small" disabled={saving} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  )
}
