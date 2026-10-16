import React from 'react'
import { NavGroup } from '@payloadcms/ui'
import type { Payload, TypedUser } from 'payload'
import { PREFERENCE_KEYS } from 'payload/shared'

const label = 'Indy Center'

const apps = [
  { name: 'Community', href: 'https://flyindycenter.com' },
  { name: 'Training Tools', href: 'https://training.flyindycenter.com' },
  { name: 'Library', href: 'https://library.flyindycenter.com' },
]

type Props = { payload: Payload; user?: TypedUser | null }

type NavPreferences = { groups?: Record<string, { open?: boolean }> }

/** Whether this person left the group open, as `NavGroup` saved it. Unset means open. */
async function isOpen({ payload, user }: Props): Promise<boolean | undefined> {
  if (!user) return undefined
  const { docs } = await payload.find({
    collection: 'payload-preferences',
    depth: 0,
    limit: 1,
    pagination: false,
    where: {
      key: { equals: PREFERENCE_KEYS.NAV },
      'user.relationTo': { equals: user.collection },
      'user.value': { equals: user.id },
    },
  })
  return (docs[0]?.value as NavPreferences | undefined)?.groups?.[label]?.open
}

/**
 * The sidebar group linking the other Indy Center apps. Each opens in a new tab, so an edit in
 * progress here is not lost. It opens and closes like Payload's own groups, and is remembered the
 * same way.
 */
export const IndyCenterLinks = async (props: Props) => (
  <NavGroup label={label} isOpen={await isOpen(props)}>
    {apps.map(({ name, href }) => (
      <a key={href} className="nav__link" href={href} target="_blank" rel="noopener noreferrer">
        <span className="nav__link-label">{name}</span>
        <span className="nav__link-new-tab">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M6 3h7v7M13 3 4 12" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="visually-hidden"> (opens in a new tab)</span>
        </span>
      </a>
    ))}
  </NavGroup>
)
