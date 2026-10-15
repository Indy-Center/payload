import type { Endpoint, PayloadRequest } from 'payload'
import { hasBearerToken, unauthorized } from '@/bearer-token'
import { idOf } from '@/courseware/ids'
import type { Partner, PartnersDocument } from './document'

/**
 * The published partners, by category. Partners are closed to the API for everyone but their
 * editors, so this reads past access and decides itself what the site gets.
 */
export async function buildPartnersDocument(req: PayloadRequest): Promise<PartnersDocument> {
  const [categories, partners] = await Promise.all([
    req.payload.find({
      collection: 'partner-categories',
      sort: ['order', 'name'],
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    }),
    req.payload.find({
      collection: 'partners',
      where: { status: { equals: 'published' } },
      sort: ['order', 'name'],
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    }),
  ])

  const byCategory = new Map<string, Partner[]>()
  for (const partner of partners.docs) {
    const categoryId = idOf(partner.category)!
    const group = byCategory.get(categoryId) ?? []
    group.push({
      // Never empty: a save fills it from the name.
      slug: partner.slug!,
      name: partner.name,
      tagline: partner.tagline ?? '',
      description: partner.description ?? '',
    })
    byCategory.set(categoryId, group)
  }

  return {
    categories: categories.docs
      .filter((category) => byCategory.has(category.id))
      .map((category) => ({
        id: category.id,
        name: category.name,
        blurb: category.blurb,
        partners: byCategory.get(category.id)!,
      })),
  }
}

export const partnersEndpoints: Endpoint[] = [
  {
    // Not /api/partners: Payload gives that path to the partners collection's own REST API.
    path: '/community/partners',
    method: 'get',
    handler: async (req) => {
      if (!hasBearerToken(req, process.env.COMMUNITY_API_TOKEN)) return unauthorized()
      return Response.json(await buildPartnersDocument(req))
    },
  },
]
