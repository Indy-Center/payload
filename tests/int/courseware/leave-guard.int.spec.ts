// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientConfig } from 'payload'
import { useModal } from '@payloadcms/ui'
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { confirmLeave, DrawerCloseGuard, LeaveGuard } from '@/components/admin/LeaveGuard'
import { AdminShell, modalButton, modalHeading } from './modals'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const config = {
  collections: [],
  globals: [],
  serverURL: '',
  routes: { admin: '/admin', api: '/api' },
  admin: { routes: {}, autoLogin: false, user: 'users' },
} as unknown as ClientConfig

const nowhere = () => {}
const router = {
  back: nowhere,
  forward: nowhere,
  refresh: nowhere,
  push: vi.fn(),
  replace: nowhere,
  prefetch: nowhere,
  bfcacheId: 'test',
} as AppRouterInstance

let root: Root | null = null
/** Stands in for Next's own listener, which draws the page the address moved to. */
const nextPopState = vi.fn()

beforeEach(() => {
  // Payload's admin asks the CMS for the account and its preferences; nothing here needs them.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({})),
  )
  window.history.replaceState(null, '', '/admin/collections/tasks?grid=true')
  window.addEventListener('popstate', nextPopState)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  window.removeEventListener('popstate', nextPopState)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.mocked(router.push).mockClear()
  nextPopState.mockClear()
})

const page = (children: React.ReactNode) =>
  React.createElement(
    AppRouterContext,
    { value: router },
    React.createElement(AdminShell, { config }, children),
  )

function show(children: React.ReactNode) {
  act(() => root?.unmount())
  const container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  act(() => root!.render(page(children)))
}

const guard = (unsaved: boolean) => React.createElement(LeaveGuard, { unsaved })

function link(href: string, attributes: Record<string, string> = {}) {
  const anchor = document.body.appendChild(document.createElement('a'))
  anchor.href = href
  anchor.textContent = 'Somewhere'
  for (const [name, value] of Object.entries(attributes)) anchor.setAttribute(name, value)
  return anchor
}

/**
 * Clicks like a person, and says whether the click was held back (`defaultPrevented`). jsdom is
 * then kept from following the link itself, whose history move would land in a later test.
 */
function click(element: Element) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
  // A click held back stops there; one let through reaches the window.
  let heldBack: boolean | null = null
  const record = (each: Event) => {
    heldBack = each.defaultPrevented
    each.preventDefault()
  }
  window.addEventListener('click', record)
  act(() => {
    element.dispatchEvent(event)
  })
  window.removeEventListener('click', record)
  return { defaultPrevented: heldBack ?? event.defaultPrevented }
}

function closeTab() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

function back() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  })
}

async function press(button: HTMLButtonElement) {
  await act(async () => button.click())
}

describe('the leave guard', () => {
  it('asks the browser before closing the tab or reloading with unsaved changes, and not without', () => {
    show(guard(true))
    expect(closeTab().defaultPrevented).toBe(true)

    act(() => root!.render(null))
    show(guard(false))
    expect(closeTab().defaultPrevented).toBe(false)
  })

  it("asks with Payload's wording before an in-app link, and follows it on Leave anyway", async () => {
    show(guard(true))
    const anchor = link('/admin/collections/courses')

    expect(click(anchor).defaultPrevented).toBe(true)
    expect(modalHeading()).toBe('Leave without saving')
    expect(document.querySelector('.confirmation-modal p')?.textContent).toBe(
      'Your changes have not been saved. If you leave now, you will lose your changes.',
    )

    await press(modalButton('Leave anyway'))
    expect(router.push).toHaveBeenCalledWith('/admin/collections/courses')
    // The leave was accepted: closing the tab on the way out does not ask again.
    expect(closeTab().defaultPrevented).toBe(false)
  })

  it('stays on the page on Stay on this page', async () => {
    show(guard(true))
    click(link('/admin/collections/courses'))

    await press(modalButton('Stay on this page'))

    expect(router.push).not.toHaveBeenCalled()
    expect(modalHeading()).toBeNull()
    expect(closeTab().defaultPrevented).toBe(true)
  })

  it('lets a link that stays on the page, or opens a new tab, go without asking', () => {
    show(guard(true))

    expect(click(link('#section')).defaultPrevented).toBe(false)
    expect(click(link('/admin/collections/courses', { target: '_blank' })).defaultPrevented).toBe(
      false,
    )
    expect(modalHeading()).toBeNull()
  })

  it('never asks with nothing unsaved', () => {
    show(guard(false))

    expect(click(link('/admin/collections/courses')).defaultPrevented).toBe(false)
    back()
    expect(nextPopState).toHaveBeenCalledTimes(1)
    expect(modalHeading()).toBeNull()
  })

  it("holds the browser's back until the person chooses to leave", async () => {
    const forward = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    const goBack = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    show(guard(true))

    back()
    // Next never drew the page back went to, and the address is moved forward again.
    expect(nextPopState).not.toHaveBeenCalled()
    expect(forward).toHaveBeenCalledWith(1)
    expect(modalHeading()).toBe('Leave without saving')
    // Moving forward is a history move of its own, and not a leave.
    back()
    expect(nextPopState).not.toHaveBeenCalled()

    await press(modalButton('Leave anyway'))
    expect(goBack).toHaveBeenCalled()
    expect(nextPopState).not.toHaveBeenCalled()
    back()
    expect(nextPopState).toHaveBeenCalledTimes(1)
  })

  it('runs a switch inside the screen at once with nothing unsaved, and after asking with', async () => {
    const go = vi.fn()
    show(guard(false))
    act(() => confirmLeave(go))
    expect(go).toHaveBeenCalledTimes(1)

    act(() => root!.render(null))
    show(guard(true))
    act(() => confirmLeave(go))
    expect(go).toHaveBeenCalledTimes(1)
    expect(modalHeading()).toBe('Leave without saving')
    await press(modalButton('Leave anyway'))
    expect(go).toHaveBeenCalledTimes(2)
  })

  it('stops asking once the changes are saved or discarded', () => {
    show(guard(true))
    act(() => root!.render(page(guard(false))))

    expect(closeTab().defaultPrevented).toBe(false)
    expect(click(link('/admin/collections/courses')).defaultPrevented).toBe(false)
  })
})

const DRAWER = 'drawer_1_lesson-plans'

/** A document drawer as Payload draws one: its close button, and the area beside it. */
function Drawer({ unsaved, onClose }: { unsaved: boolean; onClose: () => void }) {
  const { openModal, closeModal, isModalOpen } = useModal()
  React.useEffect(() => openModal(DRAWER), [openModal])
  if (!isModalOpen(DRAWER)) return null
  return React.createElement(
    'dialog',
    { id: DRAWER, open: true },
    React.createElement('button', {
      id: `close-drawer__${DRAWER}`,
      type: 'button',
      onClick: () => closeModal(DRAWER),
    }),
    React.createElement(
      'button',
      { className: 'doc-drawer__header-close', type: 'button', onClick: onClose },
      'Close',
    ),
    React.createElement(DrawerCloseGuard, { drawerSlug: DRAWER, unsaved }),
  )
}

function escape() {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        keyCode: 27,
        bubbles: true,
      } as KeyboardEventInit),
    )
  })
}

const drawerOpen = () => document.getElementById(DRAWER) !== null

describe("a document drawer's ways out", () => {
  it('sends Escape with unsaved changes to the close button, which asks', () => {
    const onClose = vi.fn()
    show(React.createElement(Drawer, { unsaved: true, onClose }))

    escape()

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(drawerOpen()).toBe(true)
  })

  it('sends a click beside the drawer with unsaved changes to the close button', () => {
    const onClose = vi.fn()
    show(React.createElement(Drawer, { unsaved: true, onClose }))

    click(document.getElementById(`close-drawer__${DRAWER}`)!)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(drawerOpen()).toBe(true)
  })

  it('lets Escape and a click beside close a drawer with nothing unsaved', () => {
    const onClose = vi.fn()
    show(React.createElement(Drawer, { unsaved: false, onClose }))
    escape()
    expect(drawerOpen()).toBe(false)

    act(() => root!.render(null))
    show(React.createElement(Drawer, { unsaved: false, onClose }))
    click(document.getElementById(`close-drawer__${DRAWER}`)!)
    expect(drawerOpen()).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })
})
