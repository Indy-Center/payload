import type { Endpoint, PayloadRequest } from 'payload'
import { hasBearerToken, unauthorized } from '@/bearer-token'
import { idOf } from '@/courseware/ids'
import type { Media } from '@/payload-types'
import type { Image, Partner, PartnersDocument } from './document'

/**
 * A media record in one of its sizes, or as uploaded when Payload made no such size (an SVG, or an
 * image already smaller). Null when there is no image to show.
 */
function image(
  media: string | Media | null | undefined,
  size: keyof NonNullable<Media['sizes']>,
): Image | null {
  if (!media || typeof media === 'string') return null
  const sized = media.sizes?.[size]
  const { url, width, height } = sized?.url ? sized : media
  if (!url || !width || !height) return null
  return { url, alt: media.alt, width, height }
}

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
      // Fills in the images, and the category, which `idOf` reads either way.
      depth: 1,
      overrideAccess: true,
      req,
    }),
  ])

  const byCategory = new Map<string, Partner[]>()
  for (const partner of partners.docs) {
    const logo = image(partner.logo, 'logo')
    // The site can't draw a partner without one.
    if (!logo) continue
    const categoryId = idOf(partner.category)!
    const group = byCategory.get(categoryId) ?? []
    group.push({
      // Never empty: a save fills it from the name.
      slug: partner.slug!,
      name: partner.name,
      tagline: partner.tagline ?? '',
      description: partner.description ?? '',
      logo,
      banner: image(partner.banner, 'banner'),
      gallery: (partner.gallery ?? []).flatMap((photo) => {
        const thumbnail = image(photo, 'thumbnail')
        const large = image(photo, 'large')
        return thumbnail && large ? [{ thumbnail, large }] : []
      }),
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
