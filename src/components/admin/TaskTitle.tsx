'use client'
import { useEffect, useState } from 'react'
import { useConfig, useDocumentInfo, useDocumentTitle, useFormFields } from '@payloadcms/ui'
import type { TaskOptions } from '@/courseware/task-picker'

/**
 * Titles a saved task's page and breadcrumb with its number, "2.2.1 Taxi to runway". The number is
 * never stored (0025), and Payload titles a page only from a stored field (`useAsTitle` refuses a
 * virtual one), so this asks the tree for the number and puts it before the name Payload's own
 * title shows, whenever Payload sets the title again. It reads the number again after each save,
 * since a new parent renumbers the task. A new task has no number yet and keeps Payload's title.
 */
export const TaskTitle = () => {
  const { config } = useConfig()
  const { id, data } = useDocumentInfo()
  const { title, setDocumentTitle } = useDocumentTitle()
  const name = useFormFields(([fields]) => fields.name?.value) as string | undefined
  const [number, setNumber] = useState<string | null>(null)
  const savedAt = (data as { updatedAt?: string } | undefined)?.updatedAt

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    fetch(`${config.serverURL}${config.routes.api}/courseware/task-options?current=${id}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? (response.json() as Promise<TaskOptions>) : null))
      .then((body) => setNumber(body?.selected?.number || null))
      .catch(() => {
        // Aborted, or the CMS could not be reached: the title stays Payload's own.
      })
    return () => controller.abort()
  }, [config.serverURL, config.routes.api, id, savedAt])

  useEffect(() => {
    if (!number || !name) return
    const numbered = `${number} ${name}`
    if (title !== numbered) setDocumentTitle(numbered)
  }, [number, name, title, setDocumentTitle])

  return null
}
