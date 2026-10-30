import type { CollectionConfig, FilterOptions, Where } from 'payload'
import { lessonPlanAccess } from '@/courseware/access'
import { COPYING_EDITION } from '@/courseware/edition-actions'
import { idOf } from '@/courseware/ids'
import { refuseMinimumOffScale } from '@/courseware/minimums'
import { placeLessonPlan } from '@/courseware/outline'
import { rowLabelComponent } from '@/courseware/row-label-component'
import { lessonPlanBodyEditor } from '@/courseware/rich-text'
import { refuseAuthorsLessonPlanStructure } from '@/courseware/structure'
import { taskPickerComponents } from '@/courseware/task-picker'
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
    // Out of the nav: lesson plans are reached from their edition on the course's page (0056).
    // The collection's pages still open by link.
    group: false,
  },
  access: lessonPlanAccess,
  hooks: {
    beforeChange: [
      async ({ context, data, operation, originalDoc, req }) => {
        await refuseAuthorsLessonPlanStructure(
          req,
          data,
          operation === 'update' ? originalDoc : null,
        )
        // A copy made by starting an edition keeps the plan as it was: its minimum, even an empty
        // one, and its rows exactly, retired tasks included.
        if (context[COPYING_EDITION]) return data
        const versionId = idOf(data.courseVersion ?? originalDoc?.courseVersion)
        const version = versionId
          ? await req.payload.findByID({
              collection: 'course-versions',
              id: versionId,
              depth: 0,
              // An edition that doesn't exist is the relationship field's own error to report.
              disableErrors: true,
              req,
            })
          : null
        if (operation === 'create' && data.minimum == null && version) {
          data.minimum = version.defaultMinimum ?? null
        }
        await refuseMinimumOffScale(
          req,
          'minimum',
          'minimum' in data ? data.minimum : originalDoc?.minimum,
          version?.gradingScale,
        )
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
    afterChange: [
      // A save that names a module puts the plan last in it, and one naming none ('') takes it out
      // of the outline; without `module` the outline is left alone. Either is a save of the
      // edition in this save's transaction, so a refusal undoes both.
      async ({ context, data, doc, req }) => {
        if (context[COPYING_EDITION] || data.module == null) return doc
        await placeLessonPlan(req, doc, data.module || null)
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'courseVersion',
      type: 'relationship',
      relationTo: 'course-versions',
      label: 'Edition',
      required: true,
      index: true,
      admin: {
        // Fixed text ("S-GC edition 3") once the plan has an edition, which adding it from its
        // edition's module sets. A plan started from its own list picks one here.
        components: { Field: '/components/admin/courses/LessonPlanEdition#LessonPlanEdition' },
      },
    },
    {
      // The module the plan sits in. Not stored on the plan: the edition's outline holds it
      // (`modules[].lessonPlans`), and a save that names one moves the plan there (afterChange).
      // Read back it is empty; the field's component shows where the plan is.
      name: 'module',
      type: 'text',
      virtual: true,
      admin: {
        readOnly: false,
        components: { Field: '/components/admin/courses/LessonPlanModule#LessonPlanModule' },
      },
    },
    { name: 'code', type: 'text', admin: { description: 'Such as S-GC-3.' } },
    { name: 'title', type: 'text' },
    { name: 'description', type: 'textarea' },
    {
      name: 'body',
      type: 'richText',
      editor: lessonPlanBodyEditor,
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
      labels: { singular: 'Theory item', plural: 'Theory items' },
      admin: {
        components: { RowLabel: rowLabelComponent('theoryItem') },
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
