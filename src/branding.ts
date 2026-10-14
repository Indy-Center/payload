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
 * Brands an admin page's metadata. The admin's page and not-found routes pass theirs through
 * this, so every admin page, list, document and not-found alike, carries the Indy Center title,
 * favicon and share text rather than Payload's or the collection's.
 */
export const withBranding = async (metadata: Promise<Metadata>): Promise<Metadata> => {
  const page = await metadata
  return { ...page, ...meta, openGraph: { ...page.openGraph, ...meta.openGraph } }
}

/**
 * Presents the admin as an Indy Center app rather than as Payload: its logo, sidebar links and
 * wording. Page metadata is branded by `withBranding`.
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
      // Payload's share image carries its logo.
      defaultOGImageType: 'off',
    },
  },
  // The account page's settings heading is the one piece of admin wording that names Payload.
  // Payload merges these over its own translations.
  i18n: {
    ...config.i18n,
    translations: { en: { general: { payloadSettings: 'Settings' } } },
  },
})
