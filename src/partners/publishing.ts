import { ValidationError } from 'payload'
import type { Partner } from '@/payload-types'
import { publicCallsToAction } from './links'

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
  const missing = (path: string, what: string) =>
    faults.push({ path, message: `Give the partner ${what} before publishing it.` })

  if (!partner.logo) missing('logo', 'a logo')
  if (blank(partner.tagline)) missing('tagline', 'a tagline')
  if (blank(partner.description)) missing('description', 'a description')
  const publicCount = publicCallsToAction(partner.callsToAction).length
  if (publicCount === 0) missing('callsToAction', 'a call to action that isn’t a member perk')
  if (publicCount > MAX_PUBLIC_CALLS_TO_ACTION) {
    faults.push({
      path: 'callsToAction',
      message: `A published partner has at most ${MAX_PUBLIC_CALLS_TO_ACTION} calls to action that aren’t member perks; this one has ${publicCount}.`,
    })
  }

  if (faults.length > 0) throw new ValidationError({ errors: faults })
}
