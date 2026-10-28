import type { CollectionConfig } from 'payload'
import { staffAccess } from '@/courseware/access'

/**
 * One edition of a framework, such as VATUSA's (USA) or VATSIM's GCAP. A revised framework is a
 * new record beside the old one, so mappings keep pointing at what they meant (decision 0020).
 *
 * The admin shows editions only as tabs on the Competencies list, and has no screen of their own:
 * the import finds an edition by its name and edition, so renaming one would make the next import
 * create a duplicate beside it. Their access and API are unchanged.
 */
export const Frameworks: CollectionConfig = {
  slug: 'frameworks',
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['name', 'edition'],
    group: 'Training',
    hidden: true,
  },
  access: staffAccess,
  indexes: [{ fields: ['name', 'edition'], unique: true }],
  fields: [
    { name: 'name', type: 'text', required: true, admin: { description: 'Such as USA or GCAP.' } },
    { name: 'edition', type: 'text', required: true },
    {
      name: 'label',
      type: 'text',
      admin: { hidden: true },
      hooks: { beforeChange: [({ data }) => `${data?.name} (${data?.edition})`] },
    },
  ],
}
