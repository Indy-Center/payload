import type { CollectionConfig } from 'payload'
import { staffAccess } from '@/courseware/access'

/**
 * One standard in one framework edition, as its source words it. A heading has no text and cannot
 * be mapped to (decision 0012). Rubric wording and the GCAP pairing sit on USA competencies
 * (decision 0011).
 *
 * Competencies come from the import (decision 0020), so the admin only shows them: every field is
 * read-only there, with no Save or Duplicate. The access rules stay as they are, because the
 * import writes through them.
 */
export const Competencies: CollectionConfig = {
  slug: 'competencies',
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['sourceId', 'title', 'framework'],
    group: 'Training',
    components: {
      // One tab per framework edition, each a tree, in place of Payload's table.
      views: { list: { Component: '/components/admin/CompetenciesList#CompetenciesList' } },
      // Nothing on the page can be changed, so there is nothing to save.
      edit: { SaveButton: '/components/admin/NoSaveButton#NoSaveButton' },
    },
  },
  disableDuplicate: true,
  access: staffAccess,
  indexes: [{ fields: ['framework', 'sourceId'], unique: true }],
  fields: [
    {
      name: 'importNote',
      type: 'ui',
      admin: { components: { Field: '/components/admin/CompetencyPage#CompetencyImportNote' } },
    },
    {
      name: 'framework',
      type: 'relationship',
      relationTo: 'frameworks',
      required: true,
      // Editions are not edited from the admin (see Frameworks).
      admin: { allowCreate: false, allowEdit: false, readOnly: true },
    },
    {
      name: 'sourceId',
      type: 'text',
      required: true,
      admin: { description: 'Such as 2.1.3a.', readOnly: true },
    },
    { name: 'title', type: 'text', required: true, admin: { readOnly: true } },
    {
      name: 'text',
      type: 'textarea',
      admin: { description: 'Empty for a heading.', readOnly: true },
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'competencies',
      admin: { readOnly: true },
      filterOptions: ({ data, id }) => ({
        framework: { equals: data?.framework },
        ...(id ? { id: { not_equals: id } } : {}),
      }),
    },
    {
      name: 'relations',
      type: 'ui',
      admin: { components: { Field: '/components/admin/CompetencyPage#CompetencyRelations' } },
    },
    {
      name: 'sourceReference',
      type: 'text',
      admin: {
        description: 'As the source gives it, such as 2-1-2 or AIM 4-3-14a.',
        readOnly: true,
      },
    },
    {
      name: 'rubricTheory',
      label: 'Rubric theory wording',
      type: 'textarea',
      admin: { readOnly: true },
    },
    {
      name: 'rubricPractical',
      label: 'Rubric practical wording',
      type: 'textarea',
      admin: { readOnly: true },
    },
    {
      name: 'pairedGcapCode',
      label: 'Paired GCAP code',
      type: 'text',
      admin: {
        description: 'VATUSA’s pairing, shown as a suggestion when mapping a task.',
        readOnly: true,
      },
    },
    {
      name: 'label',
      type: 'text',
      admin: { hidden: true },
      hooks: { beforeChange: [({ data }) => `${data?.sourceId} ${data?.title}`] },
    },
  ],
}
