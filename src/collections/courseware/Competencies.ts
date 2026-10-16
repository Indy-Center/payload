import type { CollectionConfig } from 'payload'
import { staffAccess } from '@/courseware/access'

/**
 * One standard in one framework edition, as its source words it. A heading has no text and cannot
 * be mapped to (decision 0012). Rubric wording and the GCAP pairing sit on USA competencies
 * (decision 0011).
 */
export const Competencies: CollectionConfig = {
  slug: 'competencies',
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['sourceId', 'title', 'framework'],
    group: 'Training',
  },
  access: staffAccess,
  indexes: [{ fields: ['framework', 'sourceId'], unique: true }],
  fields: [
    { name: 'framework', type: 'relationship', relationTo: 'frameworks', required: true },
    { name: 'sourceId', type: 'text', required: true, admin: { description: 'Such as 2.1.3a.' } },
    { name: 'title', type: 'text', required: true },
    { name: 'text', type: 'textarea', admin: { description: 'Empty for a heading.' } },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'competencies',
      filterOptions: ({ data, id }) => ({
        framework: { equals: data?.framework },
        ...(id ? { id: { not_equals: id } } : {}),
      }),
    },
    {
      name: 'sourceReference',
      type: 'text',
      admin: { description: 'As the source gives it, such as 2-1-2 or AIM 4-3-14a.' },
    },
    { name: 'rubricTheory', label: 'Rubric theory wording', type: 'textarea' },
    { name: 'rubricPractical', label: 'Rubric practical wording', type: 'textarea' },
    {
      name: 'pairedGcapCode',
      label: 'Paired GCAP code',
      type: 'text',
      admin: { description: 'VATUSA’s pairing, shown as a suggestion when mapping a task.' },
    },
    {
      name: 'label',
      type: 'text',
      admin: { hidden: true },
      hooks: { beforeChange: [({ data }) => `${data?.sourceId} ${data?.title}`] },
    },
  ],
}
