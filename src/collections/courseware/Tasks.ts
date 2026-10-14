import type { CollectionConfig, FieldHook } from 'payload'
import { coursewareAccess } from '@/courseware/access'
import { hideRetiredUnlessAsked } from '@/courseware/retired'

/** The GCAP code VATUSA pairs a mapped USA competency with, read fresh from the competency. */
const pairedGcapCode: FieldHook = async ({ siblingData, req }) => {
  const competency = siblingData?.competency
  if (!competency) return null
  if (typeof competency === 'object') return competency.pairedGcapCode || null
  const found = await req.payload.findByID({
    collection: 'competencies',
    id: competency,
    depth: 0,
    req,
  })
  return found.pairedGcapCode || null
}

/**
 * The one task tree every course draws from. A task's number is never stored: it comes from its
 * parent and its place among its siblings, which is the collection's drag-and-drop order (sort the
 * list by its order to drag). Inserting a task between two others renumbers the later ones.
 */
export const Tasks: CollectionConfig = {
  slug: 'tasks',
  orderable: true,
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'parent', 'retired'],
    group: 'Courseware',
    baseFilter: hideRetiredUnlessAsked,
  },
  access: coursewareAccess,
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'tasks',
      index: true,
      filterOptions: ({ id }) => ({
        retired: { not_equals: true },
        ...(id ? { id: { not_equals: id } } : {}),
      }),
    },
    {
      name: 'children',
      type: 'join',
      collection: 'tasks',
      on: 'parent',
      admin: { allowCreate: false },
    },
    {
      name: 'mappings',
      type: 'array',
      admin: {
        description:
          'Competencies this task teaches. A mapping here also applies to every task beneath it.',
      },
      fields: [
        {
          name: 'competency',
          type: 'relationship',
          relationTo: 'competencies',
          required: true,
          // A heading has no text and is not a standard anyone can be taught to.
          filterOptions: { text: { exists: true, not_equals: '' } },
        },
        {
          name: 'pairedGcapCode',
          label: 'VATUSA pairs this with GCAP',
          type: 'text',
          virtual: true,
          admin: {
            readOnly: true,
            description: 'Shown after saving. Map the GCAP competency too if it fits.',
          },
          hooks: { afterRead: [pairedGcapCode] },
        },
      ],
    },
    {
      name: 'citations',
      type: 'array',
      fields: [
        { name: 'reference', type: 'relationship', relationTo: 'references', required: true },
        {
          name: 'section',
          type: 'text',
          admin: { description: 'Where in the reference, such as 3-7-2.' },
        },
      ],
    },
    {
      name: 'retired',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Retired tasks stay where they are used but are not offered for new use.',
      },
    },
  ],
}
