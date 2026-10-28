import type { CollectionConfig, FieldHook } from 'payload'
import { staffAccess } from '@/courseware/access'
import { hideRetiredUnlessAsked } from '@/courseware/retired'
import { rowLabelComponent } from '@/courseware/row-label-component'
import { taskPickerComponents } from '@/courseware/task-picker'

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
 * parent and its place among its siblings, which is the collection's order (`_order`). Inserting a
 * task between two others renumbers the later ones. The list is the numbered tree
 * (`TaskTreeListView`), not Payload's flat list.
 */
export const Tasks: CollectionConfig = {
  slug: 'tasks',
  orderable: true,
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'parent', 'retired'],
    group: 'Training',
    baseFilter: hideRetiredUnlessAsked,
    components: {
      views: {
        // The numbered tree in place of Payload's flat list, Columns and Filters with it.
        list: { Component: '/components/admin/TaskTreeListView#TaskTreeListView' },
      },
    },
  },
  access: staffAccess,
  fields: [
    {
      // In the "Add child" drawer: the number the new task will get.
      name: 'nextNumber',
      type: 'ui',
      admin: { components: { Field: '/components/admin/TaskNextNumber#TaskNextNumber' } },
    },
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
      admin: { components: taskPickerComponents({ excludeSelf: true }) },
    },
    {
      name: 'children',
      type: 'join',
      collection: 'tasks',
      on: 'parent',
      admin: {
        allowCreate: false,
        // The direct children as a read-only grid, with "Add child" for the staff.
        components: { Field: '/components/admin/TaskChildrenField#TaskChildrenField' },
      },
    },
    {
      name: 'mappings',
      type: 'array',
      admin: {
        components: { RowLabel: rowLabelComponent('mapping') },
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
      admin: { components: { RowLabel: rowLabelComponent('citation') } },
      fields: [
        { name: 'source', type: 'relationship', relationTo: 'sources', required: true },
        {
          name: 'place',
          type: 'text',
          label: 'Place',
          admin: {
            description: 'Chapter, section or paragraph as the source writes it, such as 3-7-2.a.',
          },
        },
        {
          name: 'title',
          type: 'text',
          label: 'Title',
          admin: { description: 'The heading at that place.' },
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
