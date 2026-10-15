import type { PayloadRequest, Validate } from 'payload'
import type { Media } from '@/payload-types'
import { idOf } from '@/courseware/ids'

type MediaValue = string | Media | null | undefined

/** The media records with these ids, read past access. */
async function findMedia(ids: string[], req: PayloadRequest): Promise<Media[]> {
  if (ids.length === 0) return []
  const { docs } = await req.payload.find({
    collection: 'media',
    where: { id: { in: ids } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return docs
}

/**
 * Checks each chosen media record with `fault`, which names what is wrong with one or returns
 * nothing. Replaces the upload field's own check, so an id that names no media is refused here.
 */
function eachMedia(fault: (media: Media) => string | undefined): Validate {
  return async (value: MediaValue | MediaValue[], { req }) => {
    // A gallery may show one photo twice.
    const ids = [
      ...new Set((Array.isArray(value) ? value : [value]).map(idOf).filter((id) => id !== null)),
    ]
    const found = await findMedia(ids, req)
    if (found.length < ids.length) return 'Choose a file from Media.'
    for (const media of found) {
      const message = fault(media)
      if (message) return message
    }
    return true
  }
}

const LOGO_TYPES = ['image/svg+xml', 'image/png', 'image/webp']

export const logoRule = eachMedia((media) =>
  LOGO_TYPES.includes(media.mimeType ?? '')
    ? undefined
    : 'The logo must be an SVG, PNG or WebP file.',
)

export const logoFilter = { mimeType: { in: LOGO_TYPES } }

/** Smaller looks blurry across the top of a partner's page. */
const BANNER = { width: 1600, height: 500 }

export const bannerRule = eachMedia(({ width, height }) => {
  if (!width || !height)
    return `The banner must be an image of at least ${BANNER.width}×${BANNER.height} pixels.`
  if (width < BANNER.width || height < BANNER.height)
    return `The banner must be at least ${BANNER.width}×${BANNER.height} pixels; this one is ${width}×${height}.`
})

export const galleryRule = eachMedia(({ width, height }) =>
  width && height ? undefined : 'Gallery photos must be images.',
)

/** Images only: the picker hides anything Payload can't give a width and height. */
export const imageFilter = { mimeType: { contains: 'image/' } }
