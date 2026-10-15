import type { TextField, TextFieldSingleValidation } from 'payload'
import type { Partner } from '@/payload-types'
import type { SocialPlatform } from './document'

/** The platforms a social link may be for; the site draws each one's icon. */
export const SOCIAL_PLATFORMS = [
  { label: 'Twitch', value: 'twitch' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Discord', value: 'discord' },
  { label: 'X', value: 'x' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'GitHub', value: 'github' },
  { label: 'Web', value: 'web' },
] as const satisfies readonly { label: string; value: SocialPlatform }[]

// Fails to compile when the contract names a platform the editor can't choose.
const everyPlatformListed: Exclude<
  SocialPlatform,
  (typeof SOCIAL_PLATFORMS)[number]['value']
> extends never
  ? true
  : never = true
void everyPlatformListed

/**
 * A link the site puts in an `href`. Only web addresses: anything else, such as `javascript:`,
 * would run in a visitor's browser.
 */
const webAddress: TextFieldSingleValidation = (value) => {
  try {
    const { protocol } = new URL(value ?? '')
    if (protocol === 'https:' || protocol === 'http:') return true
  } catch {
    // Not an address at all
  }
  return 'Enter a web address starting with https:// or http://.'
}

export const urlField: TextField = {
  name: 'url',
  label: 'URL',
  type: 'text',
  required: true,
  validate: webAddress,
}

type CallToAction = NonNullable<Partner['callsToAction']>[number]

/**
 * A partner's calls to action, split into the public ones everyone sees and the member perks only
 * Indy Center members see, each in the editor's order.
 */
export function splitCallsToAction(calls: Partner['callsToAction']): {
  publicCalls: CallToAction[]
  memberPerks: CallToAction[]
} {
  const publicCalls: CallToAction[] = []
  const memberPerks: CallToAction[] = []
  for (const call of calls ?? []) (call.memberPerk ? memberPerks : publicCalls).push(call)
  return { publicCalls, memberPerks }
}
