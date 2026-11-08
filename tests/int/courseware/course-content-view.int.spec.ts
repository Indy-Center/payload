// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientConfig } from 'payload'
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { EditionOutline } from '@/components/admin/courses/EditionOutline'
import type { EditionOutline as Outline, OutlinePlan } from '@/components/admin/courses/editions'
import { AdminShell, modalButton } from './modals'

/**
 * The Content tab's outline in the browser: a module reworded in place with Save and Cancel, the
 * shared guard asking while it holds changes, and what each lesson plan row counts.
 */

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

let root: Root | null = null
let fetch: ReturnType<typeof vi.fn>

const SAVED_AT = '2026-11-08T10:00:00.000Z'

beforeEach(() => {
  fetch = vi.fn(async (url: string) =>
    Response.json(url.includes('/courseware/') ? { updatedAt: '2026-11-08T10:05:00.000Z' } : {}),
  )
  vi.stubGlobal('fetch', fetch)
  window.history.replaceState(null, '', '/admin/collections/courses/c1/content')
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  router.refresh = vi.fn()
})

const plan = (id: string, data: Partial<OutlinePlan> = {}): OutlinePlan => ({
  id,
  code: id.toUpperCase(),
  title: `Plan ${id}`,
  minutes: 45,
  tasks: { all: 8, required: 6 },
  scenarios: [],
  resources: 0,
  ...data,
})

const outline: Outline = {
  id: 'e1',
  updatedAt: SAVED_AT,
  title: 'X-GC edition 2',
  number: 2,
  gradingScale: 'Three point',
  defaultMinimum: 2,
  completionStandard: 'Finish them all.',
  modules: [
    {
      key: 'm1',
      title: 'Getting started',
      description: 'The basics',
      lessonPlans: [
        plan('x-1', {
          scenarios: ['Example ground push', 'Old push'],
          resources: 2,
        }),
        plan('x-2', { tasks: { all: 0, required: 0 } }),
      ],
    },
    { key: 'm2', title: 'Working traffic', description: null, lessonPlans: [] },
  ],
  unplaced: [plan('x-9', { tasks: { all: 0, required: 0 }, resources: 1 })],
  ownLessonPlans: 3,
}

function show(props: Partial<React.ComponentProps<typeof EditionOutline>> = {}) {
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
          React.createElement(EditionOutline, {
            edition: outline,
            editable: true,
            rearrange: true,
            ...props,
          }),
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
  return found as HTMLButtonElement
}

const hasButton = (name: string) =>
  [...document.querySelectorAll('button')].some(
    (each) => (each.getAttribute('aria-label') ?? each.textContent?.trim()) === name,
  )

async function press(element: HTMLElement) {
  await act(async () => element.click())
}

function type(name: 'title' | 'description', value: string) {
  const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!
  const prototype = field instanceof HTMLInputElement ? HTMLInputElement : HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(prototype.prototype, 'value')!.set!
  act(() => {
    setter.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** The heading of the modal open now: each module's Delete confirm is drawn, closed, from the start. */
const modalHeading = () => document.querySelector('dialog[open] h1')?.textContent ?? null

const titleField = () => document.querySelector<HTMLInputElement>('[name="title"]')

function closeTab() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

/** The outline changes the screen sent, as [path, body]. */
const sent = () =>
  fetch.mock.calls
    .filter(([url]) => String(url).includes('/courseware/'))
    .map(([url, init]) => [
      String(url).replace('/api', ''),
      JSON.parse(String((init as RequestInit).body)),
    ])

describe('a module’s form on the Content tab', () => {
  it('opens one module’s title and description in place, and Save sends them with the edition’s updatedAt', async () => {
    show()

    await press(button('Edit Getting started'))
    expect(titleField()!.value).toBe('Getting started')
    type('title', 'First steps')
    await press(button('Save'))

    expect(sent()).toEqual([
      [
        '/courseware/course-versions/e1/modules/m1',
        { title: 'First steps', description: 'The basics', updatedAt: SAVED_AT },
      ],
    ])
    expect(router.refresh).toHaveBeenCalled()
    expect(titleField()).toBeNull()
  })

  it('sends the next change from the updatedAt the last one answered', async () => {
    show()

    await press(button('Move Working traffic up'))
    await press(button('Move Getting started down'))

    expect(sent().map(([, body]) => body.updatedAt)).toEqual([SAVED_AT, '2026-11-08T10:05:00.000Z'])
  })

  it('keeps the form open with its changes when the save is refused', async () => {
    fetch.mockImplementation(async () =>
      Response.json({ errors: [{ message: 'A module needs a title.' }] }, { status: 400 }),
    )
    show()

    await press(button('Edit Getting started'))
    type('title', '')
    await press(button('Save'))

    expect(titleField()!.value).toBe('')
    expect(closeTab()).toBe(true)
  })

  it('drops the changes on Cancel, sending nothing, and stops asking', async () => {
    show()

    await press(button('Edit Getting started'))
    type('title', 'First steps')
    expect(closeTab()).toBe(true)
    await press(button('Cancel'))

    expect(titleField()).toBeNull()
    expect(sent()).toEqual([])
    expect(closeTab()).toBe(false)
    expect(document.body.textContent).toContain('Getting started')
  })

  it('asks before leaving only once the form holds a change', async () => {
    show()

    await press(button('Edit Getting started'))
    expect(closeTab()).toBe(false)
    type('description', 'Changed')
    expect(closeTab()).toBe(true)
    type('description', 'The basics')
    expect(closeTab()).toBe(false)
  })

  it('asks before opening another module’s Edit while one holds changes, and opens it on Leave anyway', async () => {
    show()

    await press(button('Edit Getting started'))
    type('title', 'First steps')
    await press(button('Edit Working traffic'))

    expect(modalHeading()).toBe('Leave without saving')
    expect(titleField()!.value).toBe('First steps')
    await press(modalButton('Leave anyway'))
    expect(titleField()!.value).toBe('Working traffic')
  })

  it('stays on the open module on Stay on this page', async () => {
    show()

    await press(button('Edit Getting started'))
    type('title', 'First steps')
    await press(button('Edit Working traffic'))
    await press(modalButton('Stay on this page'))

    expect(titleField()!.value).toBe('First steps')
  })

  it('“+ Add module” opens a new one at the end, which counts as a change, and Cancel drops it', async () => {
    show()

    await press(button('+ Add module'))
    expect(document.body.textContent).toContain('New module')
    expect(titleField()!.value).toBe('')
    expect(closeTab()).toBe(true)
    await press(button('Cancel'))

    expect(document.body.textContent).not.toContain('New module')
    expect(sent()).toEqual([])
  })

  it('saves a new module only on Save', async () => {
    show()

    await press(button('+ Add module'))
    type('title', 'Radar')
    await press(button('Save'))

    expect(sent()).toEqual([
      [
        '/courseware/course-versions/e1/modules',
        { title: 'Radar', description: '', updatedAt: SAVED_AT },
      ],
    ])
  })

  it('reloads the page on the stale refusal, closing the form', async () => {
    fetch.mockImplementation(async () =>
      Response.json(
        {
          errors: [
            {
              message:
                'Someone else changed this outline. The page has been reloaded; make your change again.',
            },
          ],
        },
        { status: 409 },
      ),
    )
    show()

    await press(button('Edit Getting started'))
    type('title', 'First steps')
    await press(button('Save'))

    expect(router.refresh).toHaveBeenCalled()
    expect(titleField()).toBeNull()
  })
})

describe('a published edition, as a course author', () => {
  it('greys out the structural controls under one line, and leaves Edit open', async () => {
    show({
      rearrange: false,
      reword: true,
      structuralNote: 'Structural changes to a published edition are made by a lead.',
    })

    expect(document.body.textContent).toContain(
      'Structural changes to a published edition are made by a lead.',
    )
    for (const name of [
      'Move Working traffic up',
      'Move Getting started down',
      'Delete Getting started',
      '+ Add module',
      '+ Add lesson plan',
      'Move X-1 down',
      'Remove from module',
    ]) {
      expect(button(name).disabled, name).toBe(true)
    }
    expect(button('Edit Getting started').disabled).toBe(false)
    expect(document.querySelector<HTMLSelectElement>('select')!.disabled).toBe(true)
  })

  it('greys out “Edit grading and completion” with them, which a draft leaves open', () => {
    show({ rearrange: false, reword: true })
    expect(button('Edit grading and completion').disabled).toBe(true)
    act(() => root?.unmount())
    document.body.innerHTML = ''

    show()
    expect(button('Edit grading and completion').disabled).toBe(false)
  })
})

describe('deleting a module', () => {
  it('confirms an empty one by its title', async () => {
    show()

    await press(button('Delete Working traffic'))

    expect(modalHeading()).toBe('Delete Working traffic?')
    expect(document.body.textContent).toContain('It holds no lesson plans.')
    expect(hasButton('Delete module')).toBe(true)
  })

  it('names the lesson plans of one that holds them, and sends where they go', async () => {
    show()

    await press(button('Delete Getting started'))
    expect(document.body.textContent).toContain('Where do its 2 lesson plans go? X-1 and X-2.')
    const where = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Where Getting started’s lesson plans go"]',
    )!
    expect([...where.options].map((option) => option.textContent)).toEqual([
      'Not in a module',
      'To the end of Working traffic',
    ])
    expect(where.value).toBe('')
    act(() => {
      where.value = 'm2'
      where.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await press(button('Delete module'))

    expect(sent()).toEqual([
      [
        '/courseware/course-versions/e1/modules/m1/delete',
        { lessonPlansTo: 'm2', updatedAt: SAVED_AT },
      ],
    ])
  })
})

describe('a lesson plan row', () => {
  const row = (code: string) =>
    [...document.querySelectorAll('tr')].find((each) => each.textContent?.includes(code))!
  const cell = (code: string, column: string) =>
    row(code).querySelector(`[data-column="${column}"]`)!.textContent

  it('counts every task and the required ones', () => {
    show()

    expect(cell('X-1', 'tasks')).toBe('8 (6 required)')
  })

  it('shows None and Publish needs one for a lesson plan with no tasks, in a module or not', () => {
    show()

    expect(cell('X-2', 'tasks')).toBe('NonePublish needs one')
    expect(cell('X-9', 'tasks')).toBe('NonePublish needs one')
  })

  it('names the scenarios it offers and counts its resources', () => {
    show()

    expect(cell('X-1', 'scenarios')).toBe('Example ground pushOld push')
    expect(cell('X-1', 'resources')).toBe('2')
    expect(cell('X-9', 'resources')).toBe('1')
    expect(cell('X-2', 'resources')).toBe('—')
  })

  it('keeps code, title and the order column at phone width, dropping the rest', () => {
    show()

    const wideOnly = [...row('X-1').querySelectorAll('td')].map((td) =>
      td.classList.contains('edition-outline__wide-only'),
    )
    expect(wideOnly).toEqual([false, false, true, true, true, true, false])
  })
})
