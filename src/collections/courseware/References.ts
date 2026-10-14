import type { CollectionConfig } from 'payload'
import { coursewareAccess } from '@/courseware/access'

/** A document tasks cite, such as the 7110.65. A reissue is fixed here once (decision 0014). */
export const References: CollectionConfig = {
  slug: 'references',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'edition'], group: 'Courseware' },
  access: coursewareAccess,
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'edition', type: 'text' },
    {
      name: 'url',
      label: 'Link',
      type: 'text',
      validate: (value: string | null | undefined, { siblingData }: { siblingData: unknown }) => {
        const document = (siblingData as { document?: unknown }).document
        if (!value) return document ? true : 'Give a link or an Indy document.'
        return /^https?:\/\//.test(value) || 'A link starts with https://.'
      },
    },
    {
      name: 'document',
      label: 'Indy document',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Uploaded documents are public.' },
    },
  ],
}
