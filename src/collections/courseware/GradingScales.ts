import { ValidationError, type CollectionConfig } from 'payload'
import { coursewareAccess } from '@/courseware/access'

/**
 * The grades a teacher chooses from, lowest first, configured rather than fixed (decision 0028).
 * Once a published course version uses a scale its points cannot be added, removed or reordered;
 * their wording can still be edited. A changed scale is a new scale.
 */
export const GradingScales: CollectionConfig = {
  slug: 'grading-scales',
  admin: { useAsTitle: 'name', group: 'Courseware' },
  access: coursewareAccess,
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (operation !== 'update') return data
        const before = (originalDoc.points ?? []).map((point: { id: string }) => point.id)
        const after = (data.points ?? []).map((point: { id?: string }) => point.id)
        if (before.join() === after.join()) return data

        const used = await req.payload.count({
          collection: 'course-versions',
          where: { gradingScale: { equals: originalDoc.id }, status: { equals: 'published' } },
          req,
        })
        if (used.totalDocs > 0) {
          throw new ValidationError({
            errors: [
              {
                path: 'points',
                message:
                  'A published course version uses this scale, so its points cannot be added, removed or reordered. Edit their wording, or make a new scale.',
              },
            ],
          })
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'points',
      type: 'array',
      required: true,
      minRows: 2,
      admin: { description: 'Lowest first. A minimum grade is a point’s place here: 1, 2, 3…' },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'description', type: 'textarea' },
      ],
    },
  ],
}
