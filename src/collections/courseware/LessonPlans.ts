import type { CollectionConfig, FilterOptions, Where } from 'payload'
import { lexicalEditor, UploadFeature } from '@payloadcms/richtext-lexical'
import { coursewareAccess } from '@/courseware/access'
import { idOf } from '@/courseware/ids'
import { refuseLessonPlanShapeChange } from '@/courseware/publishing'
import { expandTaskRows, pickableTask } from '@/courseware/task-rows'

/**
 * A lesson plan offers only its own course's scenarios, and the picker leaves out retired ones
 * other than those already offered.
 */
const ownCourseScenarios: FilterOptions = async ({ data, siblingData, req }) => {
  const versionId = idOf(data?.courseVersion)
  if (!versionId) return false
  const version = await req.payload.findByID({
    collection: 'course-versions',
    id: versionId,
    depth: 0,
    req,
  })
  const offered = ((siblingData as { scenarios?: unknown[] })?.scenarios ?? [])
    .map((scenario) => idOf(scenario as string))
    .filter((id): id is string => id !== null)
  const where: Where = {
    and: [
      { course: { equals: idOf(version.course) } },
      { or: [{ retired: { not_equals: true } }, { id: { in: offered } }] },
    ],
  }
  return where
}

export const LessonPlans: CollectionConfig = {
  slug: 'lesson-plans',
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'title', 'courseVersion'],
    group: 'Courseware',
  },
  access: coursewareAccess,
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        await refuseLessonPlanShapeChange(req, data, originalDoc)
        if (operation === 'create' && data.minimum == null && data.courseVersion) {
          const version = await req.payload.findByID({
            collection: 'course-versions',
            id: idOf(data.courseVersion)!,
            depth: 0,
            req,
          })
          data.minimum = version.defaultMinimum ?? null
        }
        data.theoryItems = await expandTaskRows(
          req,
          data.theoryItems,
          originalDoc?.theoryItems,
          'theoryItems',
          { teacherNotes: '' },
        )
        return data
      },
    ],
  },
  fields: [
    {
      name: 'courseVersion',
      type: 'relationship',
      relationTo: 'course-versions',
      required: true,
      index: true,
    },
    { name: 'code', type: 'text', admin: { description: 'Such as S-GC-3.' } },
    { name: 'title', type: 'text' },
    { name: 'description', type: 'textarea' },
    {
      name: 'body',
      type: 'richText',
      // Images go to the public media store, where the library can show them.
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures.filter((feature) => feature.key !== 'upload'),
          UploadFeature({ enabledCollections: ['media'] }),
        ],
      }),
    },
    { name: 'time', type: 'number', min: 0, admin: { description: 'Minutes.' } },
    { name: 'isExam', label: 'Exam', type: 'checkbox', defaultValue: false },
    {
      name: 'minimum',
      label: 'Minimum grade',
      type: 'number',
      min: 1,
      admin: {
        description:
          'The point on the version’s scale, counted from 1. Starts from the version’s default.',
      },
    },
    {
      name: 'theoryItems',
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
          admin: { description: 'Shown only to teachers: the prompt to ask.' },
        },
      ],
    },
    {
      name: 'scenarios',
      label: 'Scenarios offered',
      type: 'relationship',
      relationTo: 'scenarios',
      hasMany: true,
      filterOptions: ownCourseScenarios,
      admin: { description: 'Scenarios of this course the teacher may choose from.' },
    },
  ],
}
