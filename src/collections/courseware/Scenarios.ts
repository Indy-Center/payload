import type { CollectionConfig } from 'payload'
import { scenarioAccess, staffOnlyField } from '@/courseware/access'
import { hideRetiredUnlessAsked } from '@/courseware/retired'
import { positionPickerComponents, pickedPosition } from '@/courseware/position-picker'

/**
 * A setup a teacher may pick for a lesson plan; it holds no tasks, which are all on the lesson
 * plan (decision 0065). It belongs to one course, and any lesson plan in any version of that
 * course may offer it (decision 0026). Its student and teacher positions are picked from
 * Positions (decision 0060).
 */
export const Scenarios: CollectionConfig = {
  slug: 'scenarios',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'course', 'studentPosition', 'retired'],
    group: 'Training',
    baseFilter: hideRetiredUnlessAsked,
  },
  access: scenarioAccess,
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
      name: 'description',
      label: 'Description',
      type: 'textarea',
      admin: {
        description:
          "For the teacher: what this scenario sets up, such as the flight plans built for it. Students don't see it.",
      },
    },
    {
      name: 'atctrainer',
      label: 'ATCTrainer',
      type: 'text',
      admin: { description: "The scenario's link or ID in ATCTrainer" },
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
