import React from 'react'
import type { ClientConfig, SanitizedPermissions, ServerFunctionClient, TypedUser } from 'payload'
import { RootProvider } from '@payloadcms/ui'
import { enTranslations } from '@payloadcms/translations/languages/en'
import {
  PathnameContext,
  SearchParamsContext,
} from 'next/dist/shared/lib/hooks-client-context.shared-runtime'

/** Takes its children as `createElement`'s own argument. */
export const withChildren = <P extends { children: React.ReactNode }>(component: React.FC<P>) =>
  component as unknown as React.FC<Omit<P, 'children'> & { children?: React.ReactNode }>

const Root = withChildren(RootProvider)

/**
 * Payload's admin around a component that opens Payload's modals (its root provider, which holds
 * the modal library Payload bundles), with Payload's English wording and someone signed in.
 */
export function AdminShell({
  config,
  children,
}: {
  config: ClientConfig
  children?: React.ReactNode
}) {
  // Payload watches the window's width; jsdom has no layout, so no width query ever matches.
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
  // Payload reads the address through Next's hooks.
  return React.createElement(
    PathnameContext,
    { value: window.location.pathname },
    React.createElement(
      SearchParamsContext,
      { value: new URLSearchParams(window.location.search) },
      React.createElement(
        Root,
        {
          config,
          dateFNSKey: 'en-US',
          fallbackLang: 'en',
          languageCode: 'en',
          languageOptions: [],
          permissions: {} as SanitizedPermissions,
          serverFunction: (async () => ({})) as ServerFunctionClient,
          theme: 'light',
          translations: enTranslations,
          // Signed in, so the admin is drawn at once rather than after asking the CMS who is.
          user: { id: 'someone', email: 'lead@example.test', collection: 'users' } as TypedUser,
        },
        children,
      ),
    ),
  )
}

/** The heading of the confirmation modal open now, if any. */
export const modalHeading = () =>
  document.querySelector('.confirmation-modal h1')?.textContent ?? null

/** A button of the open confirmation modal: "Leave anyway" or "Stay on this page". */
export function modalButton(label: 'Leave anyway' | 'Stay on this page') {
  const found = [...document.querySelectorAll('.confirmation-modal button')].find(
    (each) => each.textContent?.trim() === label,
  )
  if (!found) throw new Error(`No modal button "${label}"`)
  return found as HTMLButtonElement
}
