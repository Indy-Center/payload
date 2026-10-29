'use client'
import { useConfig } from '@payloadcms/ui'

/** One refusal from an endpoint; the Tasks grid's also name the row they refuse. */
export type Refusal = { message: string; row?: string }

export type Outcome =
  | { ok: true; body: Record<string, unknown> }
  | {
      ok: false
      /** The refusals' messages, or one saying what went wrong when there are none. */
      messages: string[]
      /** The refusals as the endpoint sent them; empty when it sent none or wasn't reached. */
      errors: Refusal[]
      /** The CMS couldn't be reached, so nothing was asked of it. */
      unreachable: boolean
    }

export const UNREACHABLE = 'The CMS could not be reached. Try again.'

/**
 * Calls one of the admin's endpoints as the signed-in person, with an optional body (JSON, or a
 * `FormData` upload as it is), and answers with its body or its refusals.
 */
export function useEndpoint() {
  const { config } = useConfig()
  return async (
    path: string,
    method: 'get' | 'post' = 'post',
    body?: unknown,
  ): Promise<Outcome> => {
    const sent =
      body === undefined
        ? {}
        : body instanceof FormData
          ? { body }
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    let response: Response
    try {
      response = await fetch(`${config.serverURL}${config.routes.api}${path}`, {
        method: method.toUpperCase(),
        credentials: 'include',
        ...sent,
      })
    } catch {
      return { ok: false, messages: [UNREACHABLE], errors: [], unreachable: true }
    }
    const answer = await response.json().catch(() => ({}))
    if (response.ok) return { ok: true, body: answer }
    const errors: Refusal[] = Array.isArray(answer.errors) ? answer.errors : []
    const messages = errors.map((error) => error.message)
    return {
      ok: false,
      messages: messages.length ? messages : ['Something went wrong.'],
      errors,
      unreachable: false,
    }
  }
}

export type Call = ReturnType<typeof useEndpoint>
