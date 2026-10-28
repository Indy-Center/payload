import type { CollectionConfig } from 'payload'
import type { CourseVersion } from '@/payload-types'
import { courseVersionAccess, staffOnlyField } from '@/courseware/access'
import { numberEdition } from '@/courseware/editions'
import { idOf } from '@/courseware/ids'
import { refuseScaleChange, refuseUnpublishable } from '@/courseware/publishing'

export const CourseVersions: CollectionConfig = {
  slug: 'course-versions',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'updatedAt'],
    group: 'Training',
  },
  // "Start a new edition" on the course page makes a new edition. A duplicate of a published one
  // could be saved published without the publishing check.
  disableDuplicate: true,
  access: courseVersionAccess,
  // Two editions of one course never share a number (decision 0056).
  indexes: [{ fields: ['course', 'number'], unique: true }],
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        const before = operation === 'update' ? (originalDoc as CourseVersion) : null
        await numberEdition(req, data, before)
        refuseScaleChange(data, originalDoc)
        const publishing = data.status === 'published' && before?.status !== 'published'
        if (publishing) await refuseUnpublishable(req, data)
        // Set once, when the edition is published; a date sent with a save is ignored.
        data.publishedAt = publishing ? new Date().toISOString() : (before?.publishedAt ?? null)
        return data
      },
    ],
    afterChange: [
      // Publishing makes this the course's current version; the one before stays as data.
      async ({ doc, previousDoc, req }) => {
        if (doc.status !== 'published' || previousDoc?.status === 'published') return doc
        await req.payload.update({
          collection: 'courses',
          id: idOf(doc.course)!,
          data: { currentVersion: doc.id },
          req,
        })
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      admin: { hidden: true },
      hooks: {
        // A readable name for pickers and lists: "S-GC edition 2".
        beforeChange: [
          async ({ data, req }) => {
            if (!data?.course) return undefined
            const courseId = typeof data.course === 'object' ? data.course.id : data.course
            const course = await req.payload.findByID({
              collection: 'courses',
              id: courseId,
              depth: 0,
              req,
            })
            return `${course.code} edition ${data.number}`
          },
        ],
      },
    },
    { name: 'course', type: 'relationship', relationTo: 'courses', required: true, index: true },
    {
      name: 'number',
      label: 'Edition',
      type: 'number',
      required: true,
      min: 1,
      // Numbered on save (`numberEdition`), so the form may hold none yet.
      validate: () => true as const,
      admin: {
        readOnly: true,
        description: 'Numbered when the edition is first saved: one more than the course’s last.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
      index: true,
      // Publishing is for the Training Admin and leads.
      access: { create: staffOnlyField, update: staffOnlyField },
      admin: {
        position: 'sidebar',
        description:
          'Choose Published and save to publish: the version is checked, becomes the course’s current version, and its grading scale is fixed.',
      },
    },
    {
      name: 'publishedAt',
      label: 'Published',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' },
        description: 'Set when the edition is published.',
      },
    },
    { name: 'description', type: 'textarea' },
    { name: 'time', type: 'number', min: 0, admin: { description: 'Minutes.' } },
    {
      name: 'completionStandard',
      label: 'Completion standard',
      type: 'textarea',
      admin: { description: 'What a student must do to finish this edition.' },
    },
    { name: 'gradingScale', type: 'relationship', relationTo: 'grading-scales' },
    {
      name: 'defaultMinimum',
      label: 'Default minimum grade',
      type: 'number',
      min: 1,
      admin: {
        description:
          'The point on the scale, counted from 1 (the lowest). New lesson plans start from it.',
      },
    },
    {
      name: 'modules',
      type: 'array',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'textarea' },
        {
          name: 'lessonPlans',
          type: 'relationship',
          relationTo: 'lesson-plans',
          hasMany: true,
          // Only this version's own lesson plans.
          filterOptions: ({ id }) => (id ? { courseVersion: { equals: id } } : false),
        },
      ],
    },
  ],
}
