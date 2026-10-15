import type { CollectionConfig } from 'payload'
import { partnersAccess } from '@/partners/access'

/** The groups the community site's partners page is divided into, lowest order first. */
export const PartnerCategories: CollectionConfig = {
  slug: 'partner-categories',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'order'], group: 'Partners' },
  access: partnersAccess,
  defaultSort: 'order',
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'blurb', type: 'textarea', required: true },
    {
      name: 'order',
      type: 'number',
      admin: { description: 'Lowest first on the partners page.' },
    },
  ],
}
