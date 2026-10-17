import type { GlobalConfig, TextFieldSingleValidation } from 'payload'
import { trainingAdminOnly } from '@/training/access'
import { TEACHER_RESOURCE_ICONS } from '@/training/icons'

/**
 * A link training-tools puts in an `href`. Only `https`, which training-tools checks again: the
 * pages it links to are other sites, and nothing else, such as `javascript:`, may run in a
 * teacher's browser.
 */
const httpsAddress: TextFieldSingleValidation = (value) => {
  try {
    if (new URL(value ?? '').protocol === 'https:') return true
  } catch {
    // Not an address at all
  }
  return 'Enter a web address starting with https://.'
}

/**
 * The links every teacher sees on training-tools' `/teach` (training-app decision 0036). Only the
 * Training Admin sees or edits them; training-tools reads them through `GET
 * /api/training/resources`.
 */
export const TeacherResources: GlobalConfig = {
  slug: 'teacher-resources',
  label: 'Teacher resources',
  admin: { group: 'Training' },
  access: { read: trainingAdminOnly, update: trainingAdminOnly },
  fields: [
    {
      name: 'resources',
      type: 'array',
      admin: {
        components: {
          RowLabel: '/components/admin/TeacherResourceRowLabel#TeacherResourceRowLabel',
        },
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        // Plain text: training-tools draws it as text, never as HTML.
        { name: 'description', type: 'textarea' },
        { name: 'url', label: 'URL', type: 'text', required: true, validate: httpsAddress },
        {
          name: 'newTab',
          label: 'Open in a new tab',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'icon',
          type: 'select',
          required: true,
          defaultValue: 'link-variant',
          options: [...TEACHER_RESOURCE_ICONS],
        },
      ],
    },
  ],
}
