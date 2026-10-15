import { APIError, type CollectionConfig } from 'payload'
import { partnersAccess } from '@/partners/access'

/** The groups the community site's partners page is divided into, lowest order first. */
export const PartnerCategories: CollectionConfig = {
  slug: 'partner-categories',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'order'], group: 'Partners' },
  access: partnersAccess,
  defaultSort: 'order',
  hooks: {
    beforeDelete: [
      // Every partner, draft or published, is in exactly one category.
      async ({ id, req }) => {
        const { totalDocs } = await req.payload.count({
          collection: 'partners',
          where: { category: { equals: id } },
          overrideAccess: true,
          req,
        })
        if (totalDocs === 0) return
        const category = await req.payload.findByID({
          collection: 'partner-categories',
          id,
          depth: 0,
          overrideAccess: true,
          req,
        })
        const [partnerCount, them] =
          totalDocs === 1 ? ['1 partner', 'it'] : [`${totalDocs} partners`, 'them']
        throw new APIError(
          `${category.name} still has ${partnerCount}. Move ${them} to another category or delete ${them} first.`,
          409,
        )
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'blurb', type: 'textarea', required: true },
    {
      name: 'order',
      type: 'number',
      admin: { description: 'Lowest first on the partners page.' },
    },
  ],
}
