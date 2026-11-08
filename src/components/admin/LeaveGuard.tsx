'use client'
import React, { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ConfirmationModal,
  useDocumentDrawerContext,
  useForm,
  useFormModified,
  useModal,
  useTranslation,
} from '@payloadcms/ui'

/**
 * The admin's one guard against losing unsaved changes, and its only `beforeunload` listener.
 *
 * A screen with changes it has not saved renders `<LeaveGuard unsaved />`. While it does, closing
 * the tab or reloading asks with the browser's own prompt, and an in-app link, the browser's back
 * and `confirmLeave` ask with Payload's leave-without-saving wording first. With nothing unsaved it
 * never asks. Payload's own document forms already ask before a link (`LeaveWithoutSaving`) and
 * before a drawer's close button; `FormLeaveGuard`, added to every collection and global by
 * `src/leave-guard.ts`, adds the browser's back and a drawer's other ways out.
 */

type Guard = {
  unsaved: boolean
  /** Whether this guard asks before in-app links; Payload's forms ask before their own. */
  links: boolean
  /** Shows this guard's modal; `go` runs if the person leaves anyway. */
  ask: (go: () => void) => void
  /** Goes where a held-back link pointed. */
  follow: (href: string) => void
}

/** The guards mounted, oldest first: the newest unsaved one asks. */
const guards: Guard[] = []
/** A leave was accepted, so nothing asks again on the way out. */
let leaving = false
/** The address and history state of the page with unsaved changes, to put back after a back. */
let here: { url: string; state: unknown } | null = null

/** Keeps where the page is, as the changes become unsaved. */
const remember = () => {
  here = { url: window.location.href, state: window.history.state }
}

function asking(needsLinks = false): Guard | undefined {
  if (leaving) return undefined
  return [...guards].reverse().find((guard) => guard.unsaved && (!needsLinks || guard.links))
}

const leave = (go: () => void) => {
  leaving = true
  go()
}

/**
 * Runs `go` (a tab switch, a search, anything that drops what a screen holds) at once when
 * nothing is unsaved, or after the person chooses to leave anyway.
 */
export function confirmLeave(go: () => void) {
  const guard = asking()
  if (guard) guard.ask(go)
  else go()
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!asking()) return
  // The browser shows its own prompt, in its own words.
  event.preventDefault()
  event.returnValue = ''
}

/** The parts of the browser's Navigation API the guard uses; TypeScript's DOM types lack it. */
type TraverseEvent = Event & {
  navigationType: 'push' | 'replace' | 'reload' | 'traverse'
  destination: { key: string }
}
type NavigationApi = EventTarget & { traverseTo: (key: string) => unknown }
const navigationApi = () =>
  (globalThis as { navigation?: NavigationApi }).navigation as NavigationApi | undefined

/**
 * The browser's back or forward, where the browser lets a page hold one (the Navigation API, for
 * a move within the admin after the person has used the page): held before the address moves,
 * so neither Next nor anything else sees it, and taken once the person chooses to leave.
 */
function onNavigate(event: Event) {
  const traverse = event as TraverseEvent
  if (traverse.navigationType !== 'traverse' || !event.cancelable) return
  const guard = asking()
  if (!guard) return
  event.preventDefault()
  const { key } = traverse.destination
  guard.ask(() => leave(() => navigationApi()?.traverseTo(key)))
}

/**
 * The browser's back where it could not be held before the address moved. Listening in the
 * capture phase on `window` runs this before Next's own listener, which it stops, so the page
 * stays drawn; the page's address is put back at once, in the same step (a second history move
 * could be overtaken by others in flight), and back is taken once the person chooses to leave.
 */
function onPopState(event: PopStateEvent) {
  const guard = asking()
  if (!guard || !here) return
  event.stopImmediatePropagation()
  window.history.pushState(here.state, '', here.url)
  guard.ask(() => leave(() => window.history.back()))
}

function onClick(event: MouseEvent) {
  const guard = asking(true)
  if (!guard || !(event.target instanceof Element)) return
  const anchor = event.target.closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement) || !leavesPage(anchor, event)) return
  event.preventDefault()
  event.stopPropagation()
  guard.ask(() => leave(() => guard.follow(anchor.href)))
}

/**
 * Whether following a clicked link leaves this page: not one opening a new tab or a download,
 * and not one that only changes the part after `#`. Payload's own guard draws the same line.
 */
export function leavesPage(
  anchor: HTMLAnchorElement,
  event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey'>,
  here: string = window.location.href,
): boolean {
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) return false
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return false
  const from = new URL(here)
  const to = new URL(anchor.href, here)
  return to.origin + to.pathname + to.search !== from.origin + from.pathname + from.search
}

function listen(on: boolean) {
  if (on) {
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('popstate', onPopState, true)
    document.addEventListener('click', onClick, true)
    navigationApi()?.addEventListener('navigate', onNavigate)
  } else {
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('popstate', onPopState, true)
    document.removeEventListener('click', onClick, true)
    navigationApi()?.removeEventListener('navigate', onNavigate)
  }
}

function register(guard: Guard) {
  if (!guards.length) listen(true)
  guards.push(guard)
  // A new screen: whatever was left before is gone.
  leaving = false
  return () => {
    guards.splice(guards.indexOf(guard), 1)
    if (guards.length) return
    listen(false)
    leaving = false
    here = null
  }
}

/**
 * Asks before leaving while `unsaved`. Renders the modal it asks with; put it anywhere in the
 * screen that holds the changes, and pass `unsaved` false again once they are saved or discarded.
 */
export function LeaveGuard({ unsaved, links = true }: { unsaved: boolean; links?: boolean }) {
  const slug = `leave-guard-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const { openModal } = useModal()
  const { t } = useTranslation()
  const router = useRouter()
  const pending = useRef<(() => void) | null>(null)
  // The modal is drawn from the first time it is needed.
  const [asked, setAsked] = useState(false)
  // Registered once, so it keeps its place among the guards; its fields follow the props.
  const guard = useRef<Guard>({ unsaved, links, ask: () => {}, follow: () => {} })

  useEffect(() => register(guard.current), [])
  useEffect(() => {
    guard.current.unsaved = unsaved
    guard.current.links = links
    if (unsaved) remember()
  }, [unsaved, links])
  useEffect(() => {
    guard.current.ask = (go) => {
      pending.current = go
      setAsked(true)
      openModal(slug)
    }
    guard.current.follow = (href) => {
      const to = new URL(href, window.location.href)
      if (to.origin === window.location.origin) router.push(to.pathname + to.search + to.hash)
      else window.location.assign(href)
    }
  }, [openModal, router, slug])

  if (!asked) return null
  return (
    <ConfirmationModal
      modalSlug={slug}
      heading={t('general:leaveWithoutSaving')}
      body={t('general:changesNotSaved')}
      cancelLabel={t('general:stayOnThisPage')}
      confirmLabel={t('general:leaveAnyway')}
      onCancel={() => {
        pending.current = null
      }}
      onConfirm={() => {
        const go = pending.current
        pending.current = null
        go?.()
      }}
    />
  )
}

/**
 * In every Payload document form, page or drawer (a document slot, added by `src/leave-guard.ts`):
 * asks before the browser's back while the form has changes, as Payload asks before its links.
 * In a drawer, Escape and a click beside the drawer go through the drawer's close button, so
 * Payload's own leave-without-saving modal asks there too.
 */
export function FormLeaveGuard() {
  const modified = useFormModified()
  const { isValid } = useForm()
  const { drawerSlug } = useDocumentDrawerContext() as { drawerSlug?: string }
  // Payload's own guard asks on the same: changes, or a save refused for invalid fields.
  const unsaved = modified || !isValid
  return (
    <>
      <LeaveGuard unsaved={unsaved} links={false} />
      {drawerSlug ? <DrawerCloseGuard drawerSlug={drawerSlug} unsaved={unsaved} /> : null}
    </>
  )
}

/** The class of a document drawer's close button, which asks when the form has changes. */
const DRAWER_CLOSE = '.doc-drawer__header-close'

/**
 * Payload closes a drawer on Escape (the topmost modal) and on a click beside it without looking
 * at its form; only the close button in its header asks. While the form has changes, both press
 * that button instead. Shows nothing itself.
 */
export function DrawerCloseGuard({
  drawerSlug,
  unsaved,
}: {
  drawerSlug: string
  unsaved: boolean
}) {
  const { modalState } = useModal()
  const topmost = Object.values(modalState)
    .filter((modal) => modal.isOpen)
    .sort((a, b) => (a.openedOn ?? 0) - (b.openedOn ?? 0))
    .at(-1)?.slug

  useEffect(() => {
    if (!unsaved) return
    const closeAsked = () =>
      document.getElementById(drawerSlug)?.querySelector<HTMLButtonElement>(DRAWER_CLOSE)?.click()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || topmost !== drawerSlug) return
      event.stopPropagation()
      closeAsked()
    }
    const onBeside = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      if (!event.target.closest(`[id="close-drawer__${drawerSlug}"]`)) return
      event.preventDefault()
      event.stopPropagation()
      closeAsked()
    }
    // Before the modal library's own listener on the document, and before React's.
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('click', onBeside, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('click', onBeside, true)
    }
  }, [drawerSlug, unsaved, topmost])

  return null
}
