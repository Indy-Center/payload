import type { CollectionConfig } from 'payload'
import { coursewareAccess } from '@/courseware/access'

export const CourseVersions: CollectionConfig = {
  slug: 'course-versions',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'updatedAt'],
    group: 'Courseware',
  },
  access: coursewareAccess,
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
    },
    { name: 'description', type: 'textarea' },
    { name: 'time', type: 'number', min: 0, admin: { description: 'Minutes.' } },
    { name: 'academyRequired', type: 'checkbox', defaultValue: false },
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
