import type { Metadata } from 'next'
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
 * Payload builds its not-found page's metadata without `admin.meta`, so it carries Payload's
 * title, favicon and share text. The admin's page and not-found routes pass theirs through this.
 */
export const withBranding = async (metadata: Promise<Metadata>): Promise<Metadata> => {
  const page = await metadata
  return {
    ...page,
    title,
    description,
    keywords: meta.keywords,
    icons: meta.icons,
    openGraph: { ...page.openGraph, ...meta.openGraph },
  }
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
    components: {
      ...config.admin?.components,
      graphics: {
        Logo: '/components/admin/Logo#Logo',
        Icon: '/components/admin/Icon#Icon',
      },
      // Links to the other apps, and their footer at the bottom of the sidebar.
      afterNavLinks: [
        ...(config.admin?.components?.afterNavLinks ?? []),
        '/components/admin/IndyCenterLinks#IndyCenterLinks',
      ],
      afterNav: [
        ...(config.admin?.components?.afterNav ?? []),
        '/components/admin/NavFooter#NavFooter',
      ],
    },
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
