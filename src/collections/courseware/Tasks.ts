import type { CollectionConfig } from 'payload'
import { coursewareAccess } from '@/courseware/access'
import { hideRetiredUnlessAsked } from '@/courseware/retired'

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
