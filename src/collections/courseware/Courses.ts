import type { CollectionConfig } from 'payload'
import { staffAccess } from '@/courseware/access'

export const Courses: CollectionConfig = {
  slug: 'courses',
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'title', 'currentVersion'],
    group: 'Courseware',
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
