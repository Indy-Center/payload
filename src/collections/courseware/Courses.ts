import type { CollectionConfig, NumberFieldValidation, SelectFieldValidation } from 'payload'
import { number, select } from 'payload/shared'
import { staffAccess } from '@/courseware/access'

const POSITION_TYPES = ['DEL', 'GND', 'TWR', 'APP', 'DEP', 'CTR', 'FSS'] as const

const BOTH_WEEKS = 'Give both the fewest and the most weeks, or neither.'

type Siblings = Record<string, unknown> | undefined
const given = (value: unknown) => value !== null && value !== undefined

const consolidationHours: NumberFieldValidation = (value, options) => {
  const valid = number(value, options)
  if (valid !== true) return valid
  const types = (options.siblingData as Siblings)?.positionTypes as unknown[] | null | undefined
  if (!given(value) && (types ?? []).length > 0)
    return 'Consolidation needs its hours as well as its position types.'
  return true
}

const consolidationTypes: SelectFieldValidation = (value, options) => {
  const valid = select(value, options)
  if (valid !== true) return valid
  const hours = (options.siblingData as Siblings)?.hours
  if (given(hours) && ((value ?? []) as string[]).length === 0)
    return 'Consolidation hours count on at least one position type.'
  return true
}

const fewestWeeks: NumberFieldValidation = (value, options) => {
  const valid = number(value, options)
  if (valid !== true) return valid
  return given(value) || !given((options.siblingData as Siblings)?.max) || BOTH_WEEKS
}

const mostWeeks: NumberFieldValidation = (value, options) => {
  const valid = number(value, options)
  if (valid !== true) return valid
  const fewest = (options.siblingData as Siblings)?.min as number | null | undefined
  if (!given(value)) return !given(fewest) || BOTH_WEEKS
  // A missing fewest is reported on its own field.
  if (fewest === null || fewest === undefined) return true
  return (value as number) >= fewest || 'The most weeks can’t be fewer than the fewest.'
}

/**
 * A course across all its editions. Besides its code, title and authors, it says what a student
 * must do before enrolling and what the course involves (decision 0054). These enrolment facts
 * are policy: they change at any time without a new edition, and only the Training Admin and
 * leads change them, as they do the rest of the course; course authors read them.
 */
export const Courses: CollectionConfig = {
  slug: 'courses',
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'title', 'currentVersion'],
    group: 'Training',
  },
  access: staffAccess,
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'The course code training-tools uses, such as S-GC.' },
    },
    { name: 'title', type: 'text', required: true },
    {
      name: 'authors',
      label: 'Course authors',
      type: 'text',
      hasMany: true,
      admin: {
        className: 'cid',
        description:
          'VATSIM CIDs of the people who may edit this course’s drafts, lesson plans and scenarios.',
      },
      validate: (value: string[] | null | undefined) =>
        (value ?? []).every((cid) => /^\d+$/.test(cid)) || 'A course author is a CID: digits only.',
    },
    {
      name: 'prerequisitesNote',
      label: 'Prerequisites note',
      type: 'textarea',
      admin: {
        description:
          'Anything a student must do before enrolling that can’t be said otherwise, such as a policy to read.',
      },
    },
    {
      name: 'consolidation',
      type: 'group',
      admin: {
        description:
          'Optional. Hours on these position types, counted together, such as 30 hours on GND or TWR.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'hours', type: 'number', min: 1, validate: consolidationHours },
            {
              name: 'positionTypes',
              label: 'Position types',
              type: 'select',
              hasMany: true,
              options: [...POSITION_TYPES],
              validate: consolidationTypes,
            },
          ],
        },
      ],
    },
    {
      name: 'ratingExam',
      label: 'Rating exam',
      type: 'select',
      defaultValue: 'none',
      options: [
        { label: 'None', value: 'none' },
        { label: 'S1', value: 'S1' },
        { label: 'S2', value: 'S2' },
        { label: 'S3', value: 'S3' },
        { label: 'C1', value: 'C1' },
      ],
      admin: { description: 'The rating exam the course ends in.' },
    },
    {
      name: 'academyExam',
      label: 'VATUSA Academy exam',
      type: 'select',
      defaultValue: 'none',
      options: [
        { label: 'None', value: 'none' },
        { label: 'S2', value: 'S2' },
        { label: 'S3', value: 'S3' },
        { label: 'C1', value: 'C1' },
      ],
      admin: { description: 'The VATUSA Academy exam a student passes before training.' },
    },
    {
      name: 'estimatedWeeks',
      label: 'Estimated weeks',
      type: 'group',
      admin: { description: 'Optional. How long the course usually runs.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'min', label: 'Fewest', type: 'number', min: 0, validate: fewestWeeks },
            { name: 'max', label: 'Most', type: 'number', min: 0, validate: mostWeeks },
          ],
        },
      ],
    },
    {
      name: 'examOptional',
      label: 'Exam optional',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'The course can finish without its exam.' },
    },
    {
      name: 'moodleUrl',
      label: 'Moodle link',
      type: 'text',
      validate: (value: string | null | undefined) =>
        !value || value.startsWith('https://') || 'A link starts with https://.',
    },
    {
      name: 'currentVersion',
      type: 'relationship',
      relationTo: 'course-versions',
      admin: {
        readOnly: true,
        description: 'Set by publishing a version. The library shows this one.',
      },
    },
  ],
}
