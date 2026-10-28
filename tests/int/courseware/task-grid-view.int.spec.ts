// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientConfig } from 'payload'
import { ConfigProvider } from '@payloadcms/ui'
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { GridTask } from '@/courseware/task-grid'
import { TaskGrid } from '@/components/admin/TaskGrid'

// React only applies updates inside act() when told it is running under test.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const config = {
  collections: [],
  globals: [],
  serverURL: '',
  routes: { admin: '/admin', api: '/api' },
} as unknown as ClientConfig

const nowhere = () => {}
const router: AppRouterInstance = {
  back: nowhere,
  forward: nowhere,
  refresh: vi.fn(),
  push: nowhere,
  replace: nowhere,
  prefetch: nowhere,
  bfcacheId: 'test',
}

function task(
  id: string,
  name: string,
  parentId: string | null,
  order: string,
  retired = false,
): GridTask {
  return { id, name, description: `About ${name}`, parentId, retired, order }
}

// A made-up tree three levels deep, in tree order: 1 Radio > 1.1 Readbacks > 1.1.1 Numbers, and
// 2 Ground, with 3 Weather retired.
const tasks = [
  task('a', 'Radio', null, 'a0'),
  task('b', 'Readbacks', 'a', 'a1'),
  task('c', 'Numbers', 'b', 'a2'),
  task('d', 'Ground', null, 'a3'),
  task('e', 'Weather', null, 'a4', true),
]

const WithConfig = ConfigProvider as React.FC<{ config: ClientConfig; children?: React.ReactNode }>

function show(list: GridTask[] = tasks) {
  const container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  act(() =>
    root!.render(
      React.createElement(
        AppRouterContext,
        { value: router },
        React.createElement(WithConfig, { config }, React.createElement(TaskGrid, { tasks: list })),
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

function press(name: string) {
  act(() => button(name).click())
}

async function pressAndWait(name: string) {
  await act(async () => button(name).click())
}

/** Each row as "number name", placeholders as "number +", in the order shown. */
const rowsShown = () =>
  [...document.querySelectorAll('tbody tr')].map((row) => {
    const number = row.querySelector('[data-number]')?.textContent
    const name = row.querySelector<HTMLInputElement>('input[name="name"]')
    return name ? `${number} ${name.value}` : `${number} +`
  })

function nameCell(number: string) {
  const row = [...document.querySelectorAll('tbody tr')].find(
    (each) => each.querySelector('[data-number]')?.textContent === number,
  )
  return row!.querySelector<HTMLInputElement>('input[name="name"]')!
}

function type(input: HTMLInputElement, value: string) {
  // React tracks the value it set; the native setter makes the change visible to it.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const saveLabel = () =>
  [...document.querySelectorAll('button')].find((each) => each.textContent?.startsWith('Save'))
    ?.textContent

describe('the Tasks grid', () => {
  it('shows one row per task in tree order, each group of siblings ending in a placeholder', () => {
    show()

    expect(rowsShown()).toEqual([
      '1 Radio',
      '1.1 Readbacks',
      '1.1.1 Numbers',
      '1.1.2 +',
      '1.2 +',
      '2 Ground',
      // Weather is retired and hidden, keeping its number.
      '4 +',
    ])
    // Ground has no children: it offers "+ Child" and no placeholder.
    expect(() => button('Add a first task under 2')).not.toThrow()
    expect(() => button('Add a first task under 1')).toThrow()
  })

  it('moves a task among its siblings with its children, renumbering at once', () => {
    show()

    press('Move 1 down')

    expect(rowsShown()).toEqual([
      '1 Ground',
      '2 Radio',
      '2.1 Readbacks',
      '2.1.1 Numbers',
      '2.1.2 +',
      '2.2 +',
      '4 +',
    ])
    expect(saveLabel()).toBe('Save 1 change')
  })

  it('adds a task below a row, numbered where it lands, with the cursor in its name', () => {
    show()

    press('Add a task below 1')

    expect(rowsShown()).toContain('2 ')
    expect(rowsShown()).toContain('3 Ground')
    expect(document.activeElement).toBe(nameCell('2'))
    type(nameCell('2'), 'Phraseology')
    expect(rowsShown()).toContain('2 Phraseology')
    expect(saveLabel()).toBe('Save 1 change')

    press('Remove 2')
    expect(rowsShown()).toContain('2 Ground')
    expect(saveLabel()).toBe('Save 0 changes')
  })

  it('adds a first child, and one from a placeholder', () => {
    show()

    press('Add a first task under 2')
    press('New task 1.2')

    expect(rowsShown()).toEqual([
      '1 Radio',
      '1.1 Readbacks',
      '1.1.1 Numbers',
      '1.1.2 +',
      '1.2 ',
      '1.3 +',
      '2 Ground',
      '2.1 ',
      '2.2 +',
      '4 +',
    ])
  })

  it('marks an edited cell until it is edited back', () => {
    show()

    type(nameCell('2'), 'Ground work')
    expect(nameCell('2').classList).toContain('task-grid__cell--changed')
    expect(saveLabel()).toBe('Save 1 change')

    type(nameCell('2'), 'Ground')
    expect(nameCell('2').classList).not.toContain('task-grid__cell--changed')
  })

  it('strikes a retired row through until Keep, and offers Un-retire when retired are shown', () => {
    show()

    press('Retire 2')
    expect(nameCell('2').closest('tr')!.classList).toContain('task-grid__row--retiring')
    press('Keep 2')
    expect(nameCell('2').closest('tr')!.classList).not.toContain('task-grid__row--retiring')

    act(() => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    expect(rowsShown()).toContain('3 Weather')
    press('Un-retire 3')
    expect(saveLabel()).toBe('Save 1 change')
  })

  it('drops every pending change on Discard', () => {
    show()

    press('Move 1 down')
    press('Add a task below 1')
    press('Discard')

    expect(rowsShown()).toEqual([
      '1 Radio',
      '1.1 Readbacks',
      '1.1.1 Numbers',
      '1.1.2 +',
      '1.2 +',
      '2 Ground',
      '4 +',
    ])
  })

  it('sends every change in one batch, and marks each refused row with the reason', async () => {
    const fetch = vi.fn(async (..._args: unknown[]) =>
      Response.json(
        { errors: [{ row: 'new:1', message: 'Name: This field is required.' }] },
        { status: 400 },
      ),
    )
    vi.stubGlobal('fetch', fetch)
    show()

    press('Move 1 down')
    press('Add a task below 2')
    await pressAndWait('Save 2 changes')

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/courseware/task-grid')
    expect(JSON.parse(init.body as string)).toEqual({
      changes: [],
      adds: [{ key: 'new:1', parent: null, name: '', description: '' }],
      orders: [{ parent: null, tasks: ['d', 'a', 'new:1', 'e'] }],
    })
    const row = nameCell('3').closest('tr')!
    expect(row.textContent).toContain('Name: This field is required.')
    // Nothing was saved, so every change is still pending.
    expect(saveLabel()).toBe('Save 2 changes')
  })
})
