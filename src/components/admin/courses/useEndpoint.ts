'use client'
import { useConfig } from '@payloadcms/ui'

export type Outcome =
  { ok: true; body: Record<string, unknown> } | { ok: false; messages: string[] }

/**
 * Calls one of the course page's endpoints as the signed-in person, with an optional JSON body, and
 * answers with its body or the refusal's messages.
 */
export function useEndpoint() {
  const { config } = useConfig()
  return async (
    path: string,
    method: 'get' | 'post' = 'post',
    json?: unknown,
  ): Promise<Outcome> => {
    try {
      const response = await fetch(`${config.serverURL}${config.routes.api}${path}`, {
        method: method.toUpperCase(),
        credentials: 'include',
        ...(json === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) }),
      })
      const body = await response.json().catch(() => ({}))
      if (response.ok) return { ok: true, body }
      const messages = (body.errors ?? []).map((error: { message: string }) => error.message)
      return { ok: false, messages: messages.length ? messages : ['Something went wrong.'] }
    } catch {
      return { ok: false, messages: ['The CMS could not be reached. Try again.'] }
    }
  }
}

export type Call = ReturnType<typeof useEndpoint>
