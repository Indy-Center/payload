import { ValidationError, type CollectionConfig } from 'payload'

/** Bigger files make the pages that show them slow to load. */
const MAX_BYTES = 10 * 1024 * 1024

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  hooks: {
    beforeValidate: [
      // Payload has read the file by now, whether it was uploaded or fetched from a URL, and has not
      // yet stored it. A save that keeps the stored file is left alone.
      ({ data, originalDoc }) => {
        const size = data?.filesize
        if (typeof size === 'number' && size > MAX_BYTES && size !== originalDoc?.filesize) {
          throw new ValidationError({
            errors: [
              {
                path: 'file',
                message: `Files over 10 MB can’t be uploaded; this one is ${megabytes(size)}.`,
              },
            ],
          })
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    // The sizes the community site's partner pages show. Payload can't make sizes for one
    // collection's uploads only, so every image in media gets them. An image already smaller than
    // a size doesn't get that size, and SVGs get none: the original is shown instead.
    imageSizes: [
      // Fits within the square, for a partner's logo.
      { name: 'logo', width: 256, height: 256, fit: 'inside' },
      { name: 'banner', width: 2400 },
      { name: 'thumbnail', width: 400 },
      { name: 'large', width: 1600 },
    ],
  },
}
