import { ValidationError } from 'payload'
import type { Partner } from '@/payload-types'
import { splitCallsToAction } from './links'

const MAX_PUBLIC_CALLS_TO_ACTION = 3

const blank = (text: string | null | undefined) => !text?.trim()

/**
 * Refuses to publish a partner the site couldn't show in full: one with no logo, tagline or
 * description, or without one to three calls to action that aren't member perks. Each of these
 * faults is listed at once. A draft may be incomplete.
 */
export function refuseIncompletePartner(partner: Partial<Partner>): void {
  if (partner.status !== 'published') return
  const faults: { path: string; message: string }[] = []
  const fault = (path: string, message: string) => faults.push({ path, message })
  const missing = (what: string) => `Give the partner ${what} before publishing it.`

  if (!partner.logo) fault('logo', missing('a logo'))
  if (blank(partner.tagline)) fault('tagline', missing('a tagline'))
  if (blank(partner.description)) fault('description', missing('a description'))
  const publicCount = splitCallsToAction(partner.callsToAction).publicCalls.length
  if (publicCount === 0) {
    fault('callsToAction', missing('a call to action that isn’t a member perk'))
  }
  if (publicCount > MAX_PUBLIC_CALLS_TO_ACTION) {
    fault(
      'callsToAction',
      `A published partner has at most ${MAX_PUBLIC_CALLS_TO_ACTION} calls to action that aren’t member perks; this one has ${publicCount}.`,
    )
  }

  if (faults.length > 0) throw new ValidationError({ errors: faults })
}
