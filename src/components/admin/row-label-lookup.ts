'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { useConfig } from '@payloadcms/ui'
import type { RowLabelLookup } from '@/courseware/row-label-text'

/**
 * The lookup every row label of a form shares. The first row to mount asks the CMS once; the rest
 * of that form's rows, mounting a moment later, reuse the answer. A row mounting later than
 * `FRESH_FOR` after the last read (another form, or a row added after a task was created) asks
 * again, and every label updates when the answer arrives.
 */
const FRESH_FOR = 5000

let current: RowLabelLookup | null = null
let askedAt = 0
let asking = false
const listeners = new Set<() => void>()

async function refresh(url: string) {
  if (asking || Date.now() - askedAt < FRESH_FOR) return
  asking = true
  askedAt = Date.now()
  try {
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) throw new Error(`Row labels: ${response.status}`)
    current = (await response.json()) as RowLabelLookup
    listeners.forEach((listener) => listener())
  } catch {
    // Rows keep Payload's own label; the next row to mount tries again.
    askedAt = 0
  } finally {
    asking = false
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The shared lookup, or null until the first answer arrives (or if it never does). */
export function useRowLabelLookup(): RowLabelLookup | null {
  const { config } = useConfig()
  const url = `${config.serverURL}${config.routes.api}/courseware/row-labels`
  useEffect(() => {
    void refresh(url)
  }, [url])
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  )
}
