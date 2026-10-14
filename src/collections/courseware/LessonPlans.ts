import type { CollectionConfig } from 'payload'
import { lexicalEditor, UploadFeature } from '@payloadcms/richtext-lexical'
import { coursewareAccess } from '@/courseware/access'

export const LessonPlans: CollectionConfig = {
  slug: 'lesson-plans',
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'title', 'courseVersion'],
    group: 'Courseware',
  },
  access: coursewareAccess,
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
  ],
}
