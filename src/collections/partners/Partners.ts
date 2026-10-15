import { ValidationError, type CollectionConfig } from 'payload'
import { partnersAccess } from '@/partners/access'
import { bannerRule, galleryRule, imageFilter, logoFilter, logoRule } from '@/partners/images'

/** "Example Tools & Co." becomes "example-tools-co"; "Café" becomes "cafe". */
const slugify = (text: string) =>
  text
    .normalize('NFKD')
    // The accents NFKD split off their letters
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Someone Indy Center works with, shown on the community site's partners page once published.
 * Publishing is a hand-made status, as course versions have, not Payload's drafts (decision 0001):
 * a former partner goes back to draft.
 */
export const Partners: CollectionConfig = {
  slug: 'partners',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'category', 'status', 'order'],
    group: 'Partners',
  },
  access: partnersAccess,
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      // Never empty, but not `required`: the admin checks required fields before this hook fills
      // the slug in, and would refuse a new partner whose slug was left blank.
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'The partner’s address on the site: /partners/<slug>. Left empty, it is filled from the name. Saved in lowercase with hyphens.',
      },
      hooks: {
        beforeValidate: [
          ({ value, data, originalDoc, operation }) => {
            // An update that doesn't mention the slug leaves it as it is.
            if (operation === 'update' && value === undefined) return value
            const name = data?.name ?? originalDoc?.name
            const slug = slugify(value || (typeof name === 'string' ? name : ''))
            if (slug) return slug
            throw new ValidationError({
              errors: [
                {
                  path: 'slug',
                  message:
                    'Give the partner a slug: its name has no letters or digits to make one from.',
                },
              ],
            })
          },
        ],
      },
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'partner-categories',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Published partners are on the site within a few minutes.',
      },
    },
    {
      name: 'order',
      type: 'number',
      admin: {
        position: 'sidebar',
        description: 'Lowest first within its category; equal orders go by name.',
      },
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      filterOptions: logoFilter,
      validate: logoRule,
      admin: {
        description: 'A square mark, at least 256×256 pixels: SVG, PNG or WebP.',
      },
    },
    {
      name: 'banner',
      type: 'upload',
      relationTo: 'media',
      filterOptions: imageFilter,
      validate: bannerRule,
      admin: {
        description:
          'Optional. The header photo on the partner’s page, at least 1600×500 pixels. Without one the page shows a gradient.',
      },
    },
    {
      name: 'gallery',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
      filterOptions: imageFilter,
      validate: galleryRule,
      admin: {
        description: 'Optional. Photos of the partner’s work, shown in this order.',
      },
    },
    {
      name: 'tagline',
      type: 'text',
      maxLength: 120,
      admin: { description: 'One line, up to 120 characters.' },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'Plain text. Leave a blank line between paragraphs.' },
    },
  ],
}
