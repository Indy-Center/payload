import type { Plugin } from 'payload'

const title = 'Indy Center | CMS'
const description = 'Content management for Indy Center.'

// Each field replaces a Payload default that names Payload.
const meta = {
  title,
  description,
  keywords: 'Indy Center, CMS',
  openGraph: { siteName: 'Indy Center', title, description },
  // community-website's favicons, in `public/`.
  icons: [
    { rel: 'icon', type: 'image/png', sizes: '48x48', url: '/favicon.png' },
    { rel: 'icon', type: 'image/svg+xml', sizes: 'any', url: '/favicon.svg' },
  ],
}

/**
 * Presents the admin as an Indy Center app rather than as Payload.
 *
 * Listed last among the plugins, so that it sees every collection. Payload titles its list and
 * document pages after the collection ("Lesson Plans", "Editing - Course"), and only the
 * collection's own `admin.meta` can override that, so the meta is set on each one as well.
 */
export const branding: Plugin = (config) => ({
  ...config,
  admin: {
    ...config.admin,
    meta: {
      ...config.admin?.meta,
      ...meta,
      titleSuffix: '',
      // Payload's share image carries its logo.
      defaultOGImageType: 'off',
    },
  },
  collections: config.collections?.map((collection) => ({
    ...collection,
    admin: {
      ...collection.admin,
      meta: { ...collection.admin?.meta, ...meta },
    },
  })),
})
