import type { CollectionConfig } from 'payload'
import { staffAccess } from '@/courseware/access'

/**
 * An outside document tasks cite, such as the 7110.65, at its https link. A reissue is fixed here
 * once (decisions 0014, 0053).
 */
export const Sources: CollectionConfig = {
  slug: 'sources',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'edition'], group: 'Training' },
  access: staffAccess,
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'edition', type: 'text' },
    {
      name: 'url',
      label: 'Link',
      type: 'text',
      required: true,
      validate: (value: string | null | undefined) => {
        if (!value) return 'A source needs a link, starting with https://.'
        return value.startsWith('https://') || 'A link starts with https://.'
      },
    },
  ],
}
