import type { Validate } from 'payload'
import type { Partner } from '@/payload-types'
import { splitCallsToAction } from './links'

const MAX_PUBLIC_CALLS_TO_ACTION = 3

const blank = (text: string | null | undefined) => !text?.trim()

const missing = (what: string) => `Give the partner ${what} before publishing it.`

/** What is wrong with a partner's calls to action, if anything: it needs one to three that aren't member perks. */
function callsToActionFault(calls: Partner['callsToAction']): string | undefined {
  const publicCount = splitCallsToAction(calls).publicCalls.length
  if (publicCount === 0) return missing('a call to action that isn’t a member perk')
  if (publicCount > MAX_PUBLIC_CALLS_TO_ACTION) {
    return `A published partner has at most ${MAX_PUBLIC_CALLS_TO_ACTION} calls to action that aren’t member perks; this one has ${publicCount}.`
  }
}

/** What each field the publishing rule covers lacks, on a partner the site couldn't show in full. */
const publishingFaults = {
  logo: (partner) => (partner.logo ? undefined : missing('a logo')),
  tagline: (partner) => (blank(partner.tagline) ? missing('a tagline') : undefined),
  description: (partner) => (blank(partner.description) ? missing('a description') : undefined),
  callsToAction: (partner) => callsToActionFault(partner.callsToAction),
} satisfies Record<string, (partner: Partial<Partner>) => string | undefined>

/**
 * Whether a partner meets the publishing rule, so the site can draw it in full. The community
 * site's read leaves out a published partner that doesn't, which catches partners published
 * before the rule.
 */
export const meetsPublishingRule = (partner: Partial<Partner>): boolean =>
  Object.values(publishingFaults).every((fault) => fault(partner) === undefined)

/**
 * A field's own check with the publishing rule in front of it: a published partner needs a logo,
 * tagline and description, and one to three calls to action that aren't member perks. A draft may
 * be incomplete. The rule is a field check rather than a hook so that a refused save lists its
 * publishing faults and its field errors together. `data` is the stored partner with the change
 * over it, so publishing a partner saved earlier checks what it already holds.
 */
export function withPublishingRule<TValue, TField extends object>(
  field: keyof typeof publishingFaults,
  check: Validate<TValue, unknown, unknown, TField>,
): Validate<TValue, unknown, unknown, TField> {
  return (value, options) => {
    const partner: Partial<Partner> = options.data ?? {}
    const fault = partner.status === 'published' ? publishingFaults[field](partner) : undefined
    if (!fault) return check(value, options)
    // Payload shows one message per field, so a field's own error shares it with the fault.
    const withFault = (result: string | true) => (result === true ? fault : `${fault} ${result}`)
    const result = check(value, options)
    return result instanceof Promise ? result.then(withFault) : withFault(result)
  }
}
