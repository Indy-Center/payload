import type { TextFieldSingleValidation } from 'payload'
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

/**
 * A link the site puts in an `href`. Only web addresses: anything else, such as `javascript:`,
 * would run in a visitor's browser.
 */
export const webAddress: TextFieldSingleValidation = (value) => {
  try {
    const { protocol } = new URL(value ?? '')
    if (protocol === 'https:' || protocol === 'http:') return true
  } catch {
    // Not an address at all
  }
  return 'Enter a web address starting with https:// or http://.'
}
