// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { IndyCenterLinks } from '@/components/admin/IndyCenterLinks'
import { NavFooter } from '@/components/admin/NavFooter'
import { importMap } from '@/app/(payload)/admin/importMap'

// The sidebar is server-rendered, so its HTML is what a person first gets.
const html = (element: ReactElement) => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(element)
  return container
}

describe('the Indy Center group in the sidebar', () => {
  it('links to the other apps, each in a new tab and saying so', async () => {
    const payload = await getPayload({ config })
    const group = html(await IndyCenterLinks({ payload, user: null }))

    expect(group.querySelector('.nav-group__label')?.textContent).toBe('Indy Center')
    const links = [...group.querySelectorAll('a')]
    expect(
      links.map((link) => [
        link.textContent,
        link.getAttribute('href'),
        link.getAttribute('target'),
      ]),
    ).toEqual([
      ['Community Site (opens in a new tab)', 'https://flyindycenter.com', '_blank'],
      ['Training Tools (opens in a new tab)', 'https://training.flyindycenter.com', '_blank'],
      ['Indy Library (opens in a new tab)', 'https://library.flyindycenter.com', '_blank'],
    ])
    for (const link of links) expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('stays closed for someone who closed it', async () => {
    const payload = await getPayload({ config })
    await payload.delete({ collection: 'users', where: { email: { like: '@example.com' } } })
    const closer = await payload.create({
      collection: 'users',
      data: { email: 'closer@example.com', password: 'example-password' },
    })
    const other = await payload.create({
      collection: 'users',
      data: { email: 'other@example.com', password: 'example-password' },
    })
    // What the admin saves when the group's toggle is clicked
    await payload.create({
      collection: 'payload-preferences',
      data: {
        key: 'nav',
        user: { relationTo: 'users', value: closer.id },
        value: { groups: { 'Indy Center': { open: false } } },
      },
      user: { ...closer, collection: 'users' },
    })

    const isClosed = async (user: typeof closer) =>
      html(
        await IndyCenterLinks({ payload, user: { ...user, collection: 'users' } }),
      ).querySelector('.nav-group--collapsed') !== null

    expect(await isClosed(closer)).toBe(true)
    expect(await isClosed(other)).toBe(false)
  })
})

describe('the sidebar', () => {
  // The admin finds each component it is configured with in the import map; a missing entry shows
  // only at runtime.
  const slot = async (name: 'afterNavLinks' | 'afterNav') => {
    const components = (await config).admin.components?.[name] ?? []
    return components.map((component) =>
      typeof component === 'string' ? importMap[component] : component,
    )
  }

  it('shows the Indy Center group below the collections', async () => {
    expect(await slot('afterNavLinks')).toEqual([IndyCenterLinks])
  })

  it('ends with the footer, below the settings and log out', async () => {
    expect(await slot('afterNav')).toEqual([NavFooter])
  })
})

describe('the foot of the sidebar', () => {
  afterEach(() => vi.useRealTimers())

  it("carries the other apps' disclaimer and this year's copyright", () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2031-03-01T12:00:00Z') })
    const footer = html(NavFooter())

    expect([...footer.querySelectorAll('p')].map((line) => line.textContent)).toEqual([
      'This site is not affiliated with the Federal Aviation Administration or any governing aviation body. All content contained herein is approved only for use on the VATSIM network.',
      'Copyright 2031 Indy Center',
    ])
  })
})
