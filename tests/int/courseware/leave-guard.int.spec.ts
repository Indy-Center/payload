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
  delete (globalThis as { navigation?: unknown }).navigation
  undoNext.splice(0).forEach((undo) => undo())
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

/** The Courses list, then a course's page pushed by Next's router, as a link click leaves them. */
function enteredByLink() {
  const nextState = (tree: string) => ({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: tree })
  window.history.replaceState(nextState('courses list'), '', '/admin/collections/courses')
  window.history.pushState(nextState('course page'), '', '/admin/collections/courses/course-1')
}

/** Undoes what a test put on `window` for Next's router. */
const undoNext: (() => void)[] = []

/**
 * Next's app router as far as history goes (`node_modules/next/dist/client/components/
 * app-router.js`, its `onPopState` and its patched `history.pushState`). On popstate it draws the
 * page in the entry's own state (`__PRIVATE_NEXTJS_INTERNALS_TREE`), and ignores an entry with no
 * state. Its pushState passes Next's own state (`__NA`) through; any other state is given the
 * current entry's tree, which it then draws. `first` puts its listener ahead of the guard's
 * (the same phase, registered earlier); otherwise the guard's capture listener runs first.
 */
// Draws the page of the entry the address is on when it starts.
function nextRouter({ first }: { first: boolean }) {
  type NextState = { __NA?: boolean; __PRIVATE_NEXTJS_INTERNALS_TREE?: string } | null
  const router = { drawn: (window.history.state as NextState)?.__PRIVATE_NEXTJS_INTERNALS_TREE }
  const onPopState = (event: PopStateEvent) => {
    const state = event.state as NextState
    if (!state) return
    router.drawn = state.__PRIVATE_NEXTJS_INTERNALS_TREE
  }
  window.addEventListener('popstate', onPopState, first)
  const history = window.history
  const original = history.pushState.bind(history)
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    const state = data as NextState
    if (state?.__NA) return original(data, unused, url)
    const current = history.state as NextState
    const copied = {
      ...state,
      __NA: current?.__NA,
      __PRIVATE_NEXTJS_INTERNALS_TREE: current?.__PRIVATE_NEXTJS_INTERNALS_TREE,
    }
    if (url) router.drawn = copied.__PRIVATE_NEXTJS_INTERNALS_TREE
    return original(copied, unused, url)
  }
  undoNext.push(() => {
    window.removeEventListener('popstate', onPopState, first)
    history.pushState = original
  })
  return {
    get drawn() {
      // Kept up to date as the history moves; read after each move.
      return router.drawn
    },
  }
}

/** A history move in jsdom, which lands a moment later, as the browser's does. */
async function historyMove(move: () => void) {
  await act(async () => {
    move()
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

/**
 * A stand-in for the browser's Navigation API (`window.navigation`), which jsdom lacks: an event
 * target for `navigate` events with `traverseTo`. Taken away after each test.
 */
function installNavigationApi() {
  const navigation = Object.assign(new EventTarget(), { traverseTo: vi.fn() })
  ;(globalThis as { navigation?: unknown }).navigation = navigation
  return navigation
}

/** The browser's back or forward to the history entry `key`, as its `navigate` event. */
function traverse(key: string, { cancelable = true } = {}) {
  const event = Object.assign(new Event('navigate', { cancelable }), {
    navigationType: 'traverse',
    destination: { key },
  })
  act(() => {
    ;(globalThis as { navigation?: EventTarget }).navigation!.dispatchEvent(event)
  })
  return event
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

  it("holds the browser's back on a page reached by an in-app link, before the address moves", async () => {
    const navigation = installNavigationApi()
    // The list, then the course page as Next's router pushes it for a link.
    enteredByLink()
    show(guard(true))

    const event = traverse('entry-of-the-list')
    // Held: the address never moves, so Next never hears of it.
    expect(event.defaultPrevented).toBe(true)
    expect(window.location.pathname).toBe('/admin/collections/courses/course-1')
    expect(modalHeading()).toBe('Leave without saving')

    await press(modalButton('Leave anyway'))
    expect(navigation.traverseTo).toHaveBeenCalledWith('entry-of-the-list')
    // On the way out nothing holds the move again.
    expect(traverse('entry-of-the-list').defaultPrevented).toBe(false)
  })

  it('stays on the page on Stay on this page after a held back', async () => {
    const navigation = installNavigationApi()
    enteredByLink()
    show(guard(true))

    traverse('entry-of-the-list')
    await press(modalButton('Stay on this page'))

    expect(navigation.traverseTo).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/admin/collections/courses/course-1')
    expect(traverse('entry-of-the-list').defaultPrevented).toBe(true)
  })

  it('lets a back or forward the browser will not let a page hold go to the fallback', () => {
    installNavigationApi()
    show(guard(true))

    expect(traverse('another-entry', { cancelable: false }).defaultPrevented).toBe(false)
  })

  describe('without the Navigation API, on a page reached by an in-app link', () => {
    // Whichever of Next's listener and the guard's the browser runs first.
    for (const nextFirst of [true, false]) {
      const order = nextFirst ? "Next's listener first" : "the guard's listener first"

      it(`asks before back and keeps the page drawn (${order})`, async () => {
        enteredByLink()
        const next = nextRouter({ first: nextFirst })
        show(guard(true))

        await historyMove(() => window.history.back())

        expect(next.drawn).toBe('course page')
        expect(window.location.pathname).toBe('/admin/collections/courses/course-1')
        expect(modalHeading()).toBe('Leave without saving')

        await press(modalButton('Leave anyway'))
        await historyMove(() => {})
        expect(next.drawn).toBe('courses list')
        expect(window.location.pathname).toBe('/admin/collections/courses')
      })

      it(`asks again on the next back after Stay on this page (${order})`, async () => {
        enteredByLink()
        const next = nextRouter({ first: nextFirst })
        show(guard(true))

        await historyMove(() => window.history.back())
        await press(modalButton('Stay on this page'))
        await historyMove(() => window.history.back())

        expect(next.drawn).toBe('course page')
        expect(window.location.pathname).toBe('/admin/collections/courses/course-1')
        expect(modalHeading()).toBe('Leave without saving')
      })
    }

    it('asks nothing on back once the changes are saved', async () => {
      enteredByLink()
      const next = nextRouter({ first: true })
      show(guard(true))
      act(() => root!.render(page(guard(false))))

      // The first back steps off the guard's spare entry, onto the same page.
      await historyMove(() => window.history.back())
      expect(modalHeading()).toBeNull()
      expect(next.drawn).toBe('course page')
      await historyMove(() => window.history.back())
      expect(next.drawn).toBe('courses list')
    })
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
