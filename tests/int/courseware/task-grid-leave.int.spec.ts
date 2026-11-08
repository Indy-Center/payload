// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientConfig, PaginatedDocs } from 'payload'
import { ListQueryProvider } from '@payloadcms/ui'
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { GridTask } from '@/courseware/task-grid'
import { TaskTreeList } from '@/components/admin/TaskTreeList'
import { AdminShell, modalButton, modalHeading, withChildren } from './modals'

const ListQuery = withChildren(ListQueryProvider)

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
  refresh: vi.fn(),
  push: vi.fn(),
  replace: nowhere,
  prefetch: nowhere,
  bfcacheId: 'test',
} as AppRouterInstance

/** What the Tasks list asks for when a tab is chosen: `grid` gone is the Tree tab. */
const queryChanged = vi.fn()
let root: Root | null = null

beforeEach(() => {
  // The grid's Save, and Payload's admin asking the CMS for the account and its preferences.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => Response.json(url.endsWith('/task-grid') ? { saved: {} } : {})),
  )
  window.history.replaceState(null, '', '/admin/collections/tasks?grid=true')
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  queryChanged.mockClear()
})

const tasks: GridTask[] = [
  {
    id: 'a',
    name: 'Radio',
    description: 'About radio',
    knowledgeStatement: '',
    skillStatement: '',
    parentId: null,
    retired: false,
    order: 'a0',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
  {
    id: 'b',
    name: 'Ground',
    description: 'About ground',
    knowledgeStatement: '',
    skillStatement: '',
    parentId: null,
    retired: false,
    order: 'a1',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
]

const noDocs = { docs: [], totalDocs: 0, limit: 10, page: 1 } as unknown as PaginatedDocs

function show() {
  const container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  act(() =>
    root!.render(
      React.createElement(
        AppRouterContext,
        { value: router },
        React.createElement(
          AdminShell,
          { config },
          React.createElement(
            ListQuery,
            { data: noDocs, query: {}, modifySearchParams: false, onQueryChange: queryChanged },
            React.createElement(TaskTreeList, {
              list: null,
              grid: tasks,
              mayEditGrid: true,
              search: '',
              showRetired: false,
              hasCreatePermission: false,
              newDocumentURL: '',
            }),
          ),
        ),
      ),
    ),
  )
}

function button(name: string) {
  const found = [...document.querySelectorAll('button')].find(
    (each) => (each.getAttribute('aria-label') ?? each.textContent?.trim()) === name,
  )
  if (!found) throw new Error(`No button "${name}"`)
  return found
}

async function press(element: HTMLElement) {
  await act(async () => element.click())
}

function editFirstName(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[name="name"]')!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const treeTab = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')][0]
const switchedToTree = () =>
  queryChanged.mock.calls.some(([query]) => (query as { grid?: string }).grid === undefined)

function closeTab() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('leaving the Tasks grid', () => {
  it('asks before switching to the Tree tab with a pending change, and switches on Leave anyway', async () => {
    show()
    editFirstName('Radio work')

    await press(treeTab())

    expect(modalHeading()).toBe('Leave without saving')
    expect(switchedToTree()).toBe(false)
    await press(modalButton('Leave anyway'))
    expect(switchedToTree()).toBe(true)
  })

  it('keeps the grid and its change on Stay on this page', async () => {
    show()
    editFirstName('Radio work')

    await press(treeTab())
    await press(modalButton('Stay on this page'))

    expect(switchedToTree()).toBe(false)
    expect(document.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe('Radio work')
  })

  it('switches to the Tree tab without asking when nothing is pending', async () => {
    show()

    await press(treeTab())

    expect(modalHeading()).toBeNull()
    expect(switchedToTree()).toBe(true)
  })

  it('asks the browser before closing the tab with a pending change, and not after Discard', async () => {
    show()
    editFirstName('Radio work')
    expect(closeTab()).toBe(true)

    await press(button('Discard'))
    expect(closeTab()).toBe(false)
  })

  it('stops asking once the changes are saved', async () => {
    show()
    editFirstName('Radio work')

    await press(button('Save 1 change'))
    expect(router.refresh).toHaveBeenCalled()
    await press(treeTab())

    expect(modalHeading()).toBeNull()
    expect(switchedToTree()).toBe(true)
    expect(closeTab()).toBe(false)
  })
})
