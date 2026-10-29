import type { CollectionConfig } from 'payload'
import { scenarioAccess, staffOnlyField } from '@/courseware/access'
import { hideRetiredUnlessAsked } from '@/courseware/retired'
import { rowLabelComponent } from '@/courseware/row-label-component'
import { positionPickerComponents, pickedPosition } from '@/courseware/position-picker'
import { refuseAuthorsScenarioStructure } from '@/courseware/structure'
import { taskPickerComponents } from '@/courseware/task-picker'
import { expandTaskRows, pickableTask } from '@/courseware/task-rows'

/**
 * A set of practical tasks posed together at one position. It belongs to one course, and any
 * lesson plan in any version of that course may offer it (decision 0026). Its student and
 * teacher positions are picked from Positions (decision 0060).
 */
export const Scenarios: CollectionConfig = {
  slug: 'scenarios',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'course', 'studentPosition', 'mode', 'retired'],
    group: 'Training',
    baseFilter: hideRetiredUnlessAsked,
  },
  access: scenarioAccess,
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        await refuseAuthorsScenarioStructure(req, data, operation === 'update' ? originalDoc : null)
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
    {
      name: 'name',
      label: 'ATCT scenario name',
      type: 'text',
      required: true,
      admin: { description: 'As it is named in ATCTrainer, so teachers can find it there.' },
    },
    { name: 'airport', type: 'text', required: true, admin: { description: 'Such as KIND.' } },
    {
      name: 'studentPosition',
      label: 'Student position',
      type: 'relationship',
      relationTo: 'positions',
      required: true,
      index: true,
      validate: pickedPosition('studentPosition'),
      admin: { components: positionPickerComponents() },
    },
    {
      name: 'teacherPosition',
      label: 'Teacher position',
      type: 'relationship',
      relationTo: 'positions',
      required: true,
      index: true,
      validate: pickedPosition('teacherPosition'),
      admin: { components: positionPickerComponents() },
    },
    {
      name: 'difficulty',
      type: 'select',
      options: [
        { label: 'Easy', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard', value: 'hard' },
      ],
    },
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
      labels: { singular: 'Practical task', plural: 'Practical tasks' },
      admin: {
        components: { RowLabel: rowLabelComponent('practicalTask') },
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
          admin: { components: taskPickerComponents() },
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
