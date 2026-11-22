import type { CollectionConfig } from 'payload'
import { scenarioAccess, staffOnlyField } from '@/courseware/access'
import { hideRetiredUnlessAsked } from '@/courseware/retired'
import { positionPickerComponents, pickedPosition } from '@/courseware/position-picker'
import { rowLabelComponent } from '@/courseware/row-label-component'

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
    // Out of the nav: scenarios are worked on from their course page's Scenarios tab, as editions
    // and lesson plans are from Content (0056). The collection's pages still open by link, and its
    // access is unchanged.
    group: false,
    baseFilter: hideRetiredUnlessAsked,
  },
  access: scenarioAccess,
  fields: [
    {
      name: 'course',
      type: 'relationship',
      relationTo: 'courses',
      required: true,
      index: true,
      admin: {
        // Fixed text once set, as "+ Add scenario" on the course page sets it.
        components: { Field: '/components/admin/courses/ScenarioCourse#ScenarioCourse' },
      },
    },
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
      name: 'description',
      label: 'Description',
      type: 'textarea',
      admin: {
        description:
          "For the teacher: what this scenario sets up, and how its difficulties differ. Students don't see it.",
      },
    },
    {
      // One scenario per setup: its difficulties are the events, each tagged with the level it first
      // appears at (decision 0070).
      name: 'events',
      type: 'array',
      label: 'Scenario events',
      labels: { singular: 'Scenario event', plural: 'Scenario events' },
      admin: {
        components: { RowLabel: rowLabelComponent('scenario-event') },
        description:
          'In the order they happen. Each is tagged with the difficulty it first appears at; harder levels keep everything easier ones have.',
      },
      fields: [
        {
          name: 'difficulty',
          type: 'select',
          required: true,
          defaultValue: 'easy',
          options: [
            { label: 'Easy', value: 'easy' },
            { label: 'Medium', value: 'medium' },
            { label: 'Hard', value: 'hard' },
          ],
        },
        {
          name: 'callsign',
          type: 'text',
          admin: { description: 'Such as AAL1423.' },
        },
        {
          name: 'aircraftType',
          label: 'Aircraft type',
          type: 'text',
          admin: { description: 'Such as A321.' },
        },
        {
          name: 'description',
          type: 'textarea',
          required: true,
          admin: {
            description:
              "What happens: an aircraft's request, or a coordination such as a TMU ground stop.",
          },
        },
      ],
    },
    {
      name: 'atctrainer',
      label: 'ATCTrainer',
      type: 'text',
      admin: { description: "The scenario's link or ID in ATCTrainer" },
    },
    {
      // Read-only: which lesson plans offer this scenario, which is set on each lesson plan.
      name: 'offeredBy',
      type: 'ui',
      admin: {
        components: { Field: '/components/admin/courses/ScenarioOfferedBy#ScenarioOfferedBy' },
      },
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
