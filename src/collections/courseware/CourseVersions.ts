import type { CollectionConfig } from 'payload'
import { coursewareAccess } from '@/courseware/access'
import { idOf } from '@/courseware/ids'
import { refuseUnpublishable, refuseVersionShapeChange } from '@/courseware/publishing'

export const CourseVersions: CollectionConfig = {
  slug: 'course-versions',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'updatedAt'],
    group: 'Courseware',
  },
  access: coursewareAccess,
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        refuseVersionShapeChange(data, originalDoc)
        if (data.status === 'published' && originalDoc?.status !== 'published') {
          await refuseUnpublishable(req, data)
        }
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
        // A readable name for pickers and lists: "S-GC v2".
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
            return `${course.code} v${data.number}`
          },
        ],
      },
    },
    { name: 'course', type: 'relationship', relationTo: 'courses', required: true, index: true },
    { name: 'number', type: 'number', required: true, min: 1 },
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
      admin: {
        position: 'sidebar',
        description:
          'Choose Published and save to publish: the version is checked, becomes the course’s current version, and its shape is frozen.',
      },
    },
    { name: 'description', type: 'textarea' },
    { name: 'time', type: 'number', min: 0, admin: { description: 'Minutes.' } },
    { name: 'academyRequired', type: 'checkbox', defaultValue: false },
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
