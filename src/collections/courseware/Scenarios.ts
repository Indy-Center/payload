import type { CollectionConfig } from 'payload'
import { scenarioAccess, staffOnlyField } from '@/courseware/access'
import { hideRetiredUnlessAsked } from '@/courseware/retired'
import { expandTaskRows, pickableTask } from '@/courseware/task-rows'

/**
 * A set of practical tasks posed together at one position. It belongs to one course, and any
 * lesson plan in any version of that course may offer it (decision 0026).
 */
export const Scenarios: CollectionConfig = {
  slug: 'scenarios',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'course', 'position', 'mode', 'retired'],
    group: 'Training',
    baseFilter: hideRetiredUnlessAsked,
  },
  access: scenarioAccess,
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        data.practicalTasks = await expandTaskRows(
          req,
          data.practicalTasks,
          originalDoc?.practicalTasks,
          'practicalTasks',
          { teacherNotes: '', required: true },
        )
        return data
      },
    ],
  },
  fields: [
    { name: 'course', type: 'relationship', relationTo: 'courses', required: true, index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'airport', type: 'text', required: true, admin: { description: 'Such as KIND.' } },
    {
      name: 'position',
      type: 'text',
      required: true,
      admin: { description: 'In VATUSA’s format, such as IND_GND or IND_1_TWR.' },
      validate: (value: string | null | undefined) =>
        /^[A-Z0-9]+(_[A-Z0-9]+)*_(DEL|GND|TWR|APP|DEP|CTR|FSS)$/.test(value ?? '') ||
        'Write the position as VATUSA does, such as IND_GND.',
    },
    { name: 'difficulty', type: 'text' },
    {
      name: 'mode',
      label: 'Live or sim',
      type: 'select',
      required: true,
      defaultValue: 'sim',
      options: [
        { label: 'Sim', value: 'sim' },
        { label: 'Live network', value: 'live' },
      ],
    },
    {
      name: 'practicalTasks',
      type: 'array',
      admin: {
        description:
          'Adding a task that has tasks beneath it adds a row for each of them when you save.',
      },
      fields: [
        {
          name: 'task',
          type: 'relationship',
          relationTo: 'tasks',
          required: true,
          filterOptions: pickableTask,
        },
        {
          name: 'teacherNotes',
          type: 'textarea',
          admin: { description: 'Shown only to teachers: how to pose the challenge.' },
        },
        {
          name: 'required',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'The scenario cannot be completed without it.' },
        },
      ],
    },
    {
      name: 'retired',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      access: { create: staffOnlyField, update: staffOnlyField },
      admin: {
        position: 'sidebar',
        description: 'Retired scenarios stay where they are offered but are not offered anew.',
      },
    },
  ],
}
