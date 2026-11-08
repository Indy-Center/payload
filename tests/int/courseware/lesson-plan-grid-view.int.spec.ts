// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientConfig } from 'payload'
import { ConfigProvider } from '@payloadcms/ui'
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { GridPlanTask, PickerTask } from '@/courseware/lesson-plan-grid'
import { LessonPlanTaskGrid } from '@/components/admin/LessonPlanTaskGrid'

/**
 * A lesson plan's "Edit as grid" tab in the browser: pending changes, "Add tasks", Save and
 * Discard, and what a course author may change in a published edition.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

/** What Save sent, and what the endpoint answers. */
let sent: unknown[] = []
let answer: () => Response = () => Response.json({ saved: { rows: 0 } })
let root: Root | null = null

beforeEach(() => {
  sent = []
  answer = () => Response.json({ saved: { rows: 0 } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body ?? '{}')))
      return answer()
    }),
  )
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

// A made-up tree: 1 Radio > 1.1 Readbacks > 1.1.1 Numbers, 1.2 Frequencies; 2 Ground. Retired
// tasks never reach the picker.
const pick = (
  id: string,
  number: string,
  name: string,
  parentId: string | null,
  statements: 'K' | 'S' | 'KS' | '' = 'KS',
): PickerTask => ({
  id,
  number,
  name,
  parentId,
  depth: number.split('.').length - 1,
  knowledgeStatement: statements.includes('K') ? `Know ${name}` : '',
  skillStatement: statements.includes('S') ? `Do ${name}` : '',
})
const picker = [
  pick('radio', '1', 'Radio', null),
  pick('readbacks', '1.1', 'Readbacks', 'radio', 'K'),
  pick('numbers', '1.1.1', 'Numbers', 'readbacks', 'S'),
  pick('frequencies', '1.2', 'Frequencies', 'radio'),
  pick('ground', '2', 'Ground', null),
]

const saved: GridPlanTask[] = [
  {
    id: 'row-1',
    task: 'ground',
    number: '2',
    name: 'Ground',
    retired: false,
    knowledgeStatement: 'Know Ground',
    skillStatement: 'Do Ground',
    required: true,
    teacherNotes: 'Ask about taxiways',
  },
  {
    id: 'row-2',
    task: 'numbers',
    number: '1.1.1',
    name: 'Numbers',
    retired: false,
    knowledgeStatement: '',
    skillStatement: 'Do Numbers',
    required: false,
    teacherNotes: '',
  },
]

const WithConfig = ConfigProvider as React.FC<{ config: ClientConfig; children?: React.ReactNode }>
const LOCKED = 'Structural changes to a published edition are made by a lead.'
/** The lesson plan's `updatedAt` as the grid loaded it. */
const LOADED = '2026-11-01T10:00:00.000Z'
const STALE_PLAN =
  'Someone else saved this lesson plan since the grid was opened. Reload it and make your changes again.'

function show(props: Partial<React.ComponentProps<typeof LessonPlanTaskGrid>> = {}) {
  const container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  act(() =>
    root!.render(
      React.createElement(
        AppRouterContext,
        { value: router },
        React.createElement(
          WithConfig,
          { config },
          React.createElement(LessonPlanTaskGrid, {
            planId: 'plan-1',
            updatedAt: LOADED,
            rows: saved,
            picker,
            mayEdit: true,
            mayChangeStructure: true,
            lockedNote: LOCKED,
            ...props,
          }),
        ),
      ),
    ),
  )
}

const buttons = () => [...document.querySelectorAll('button')]
function button(name: string) {
  const found = buttons().find(
    (each) => (each.getAttribute('aria-label') ?? each.textContent?.trim()) === name,
  )
  if (!found) throw new Error(`No button "${name}"`)
  return found
}
const press = (name: string) => act(() => button(name).click())
const pressAndWait = async (name: string) => act(async () => button(name).click())
const saveLabel = () => buttons().find((each) => each.textContent?.startsWith('Save'))?.textContent

const input = (label: string) => {
  const found = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  )
  if (!found) throw new Error(`No input "${label}"`)
  return found
}
const box = (label: string) => input(label) as HTMLInputElement
const click = (label: string) => act(() => box(label).click())

function type(field: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!
  act(() => {
    setter.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Each row as "order task required", in the order shown. */
const rowsShown = () =>
  [...document.querySelectorAll('tbody tr')].map((row) => {
    const order = row.querySelector('[data-number]')?.textContent
    const task = row.querySelector('[data-task]')?.textContent
    const required = row.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked
    return `${order} ${task}${required ? ' required' : ''}`
  })

/** Each row's knowledge and skill statement cells, as shown. */
const statementsShown = () =>
  [...document.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('.task-grid__statement')].map((cell) => cell.textContent),
  )

/** Whether leaving now would ask: the shared guard's prompt before closing the tab. */
function asksBeforeUnload() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('a lesson plan’s grid', () => {
  it('shows a row per task with its order, number, name and statements, and no grade boxes', () => {
    show()

    expect(rowsShown()).toEqual(['1 2 Ground required', '2 1.1.1 Numbers'])
    // Numbers has no knowledge statement.
    expect(statementsShown()).toEqual([
      ['Know Ground', 'Do Ground'],
      ['None', 'Do Numbers'],
    ])
    // Required is the only box on a row.
    expect(document.querySelectorAll('tbody input[type="checkbox"]')).toHaveLength(2)
    expect(document.body.textContent).not.toContain('Grade')
    expect(saveLabel()).toBe('Save 0 changes')
    expect(asksBeforeUnload()).toBe(false)
  })

  it('keeps changes pending, asking before leaving, until Discard drops them', () => {
    show()

    click('Required on 1.1.1')
    type(input('Teacher notes on 2'), 'Hold short')
    press('Move 1.1.1 up')

    expect(rowsShown()).toEqual(['1 1.1.1 Numbers required', '2 2 Ground required'])
    // Required, the notes, and the two rows the move swapped.
    expect(saveLabel()).toBe('Save 4 changes')
    expect(asksBeforeUnload()).toBe(true)

    // A removed row's edits and place no longer count: only its removal does.
    press('Remove 2')
    expect(rowsShown()).toEqual(['1 1.1.1 Numbers required', '– 2 Ground required'])
    expect(saveLabel()).toBe('Save 2 changes')

    press('Discard')

    expect(rowsShown()).toEqual(['1 2 Ground required', '2 1.1.1 Numbers'])
    expect(input('Teacher notes on 2').value).toBe('Ask about taxiways')
    expect(saveLabel()).toBe('Save 0 changes')
    expect(asksBeforeUnload()).toBe(false)
    expect(sent).toEqual([])
  })

  it('adds ticked tasks from the tree, in tree order, after the existing rows', () => {
    show()

    press('Add tasks')
    // Numbers is on the lesson plan already.
    expect(box('1.1.1 Numbers').disabled).toBe(true)
    expect(box('1.1.1 Numbers').checked).toBe(true)
    expect(document.body.textContent).toContain('Already added')

    // Ticking Radio ticks everything beneath it but Numbers; unticking Readbacks leaves the rest.
    click('1 Radio')
    expect(
      ['1 Radio', '1.1 Readbacks', '1.2 Frequencies'].map((name) => box(name).checked),
    ).toEqual([true, true, true])
    click('1.1 Readbacks')
    expect(box('1.1 Readbacks').checked).toBe(false)
    expect(box('1.2 Frequencies').checked).toBe(true)
    press('Add 2 tasks')

    expect(rowsShown()).toEqual([
      '1 2 Ground required',
      '2 1.1.1 Numbers',
      '3 1 Radio required',
      '4 1.2 Frequencies required',
    ])
    expect(saveLabel()).toBe('Save 2 changes')
  })

  it('brings in an added row’s statements from its task', () => {
    show()

    press('Add tasks')
    click('1.1 Readbacks')
    click('1.1.1 Numbers') // already added: nothing happens
    press('Add 1 task')

    expect(rowsShown().at(-1)).toBe('3 1.1 Readbacks required')
    expect(statementsShown().at(-1)).toEqual(['Know Readbacks', 'None'])
  })

  it('saves every row in its order through one endpoint', async () => {
    show()

    press('Move 1.1.1 up')
    press('Add tasks')
    click('2 Ground') // already added
    click('1.2 Frequencies')
    press('Add 1 task')
    type(input('Teacher notes on 1.2'), 'Two of them')
    await pressAndWait('Save 3 changes')

    expect(sent).toEqual([
      {
        updatedAt: LOADED,
        rows: [
          { key: 'row-2', id: 'row-2', task: 'numbers', required: false, teacherNotes: '' },
          {
            key: 'row-1',
            id: 'row-1',
            task: 'ground',
            required: true,
            teacherNotes: 'Ask about taxiways',
          },
          { key: 'new:1', task: 'frequencies', required: true, teacherNotes: 'Two of them' },
        ],
      },
    ])
    expect(router.refresh).toHaveBeenCalled()
    // Saved: nothing is left to lose while the rows are read again.
    expect(asksBeforeUnload()).toBe(false)
  })

  it('leaves out a removed row, and marks each row a refused save names', async () => {
    answer = () =>
      Response.json(
        { errors: [{ row: 'row-2', message: 'This task is retired.' }] },
        { status: 400 },
      )
    show()

    press('Remove 2')
    await pressAndWait('Save 1 change')

    expect((sent[0] as { rows: { key: string }[] }).rows.map((row) => row.key)).toEqual(['row-2'])
    expect(document.querySelector('tr[data-row="row-2"]')?.textContent).toContain(
      'This task is retired.',
    )
    // Still pending, so leaving still asks.
    expect(saveLabel()).toBe('Save 1 change')
    expect(asksBeforeUnload()).toBe(true)
  })

  it('shows a stale Save’s refusal and keeps every pending change on screen', async () => {
    answer = () => Response.json({ errors: [{ message: STALE_PLAN }] }, { status: 409 })
    show()

    click('Required on 2')
    type(input('Teacher notes on 2'), 'Ask about hold short')
    await pressAndWait('Save 2 changes')

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(STALE_PLAN)
    expect(rowsShown()).toEqual(['1 2 Ground', '2 1.1.1 Numbers'])
    expect(input('Teacher notes on 2').value).toBe('Ask about hold short')
    expect(saveLabel()).toBe('Save 2 changes')
    expect(asksBeforeUnload()).toBe(true)
  })

  it('leaves a course author only teacher notes in a published edition', () => {
    show({ mayChangeStructure: false })

    expect(document.body.textContent).toContain(LOCKED)
    expect(() => button('Add tasks')).toThrow()
    expect(() => button('Move 2 down')).toThrow()
    expect(() => button('Remove 2')).toThrow()
    expect(box('Required on 2').disabled).toBe(true)

    type(input('Teacher notes on 2'), 'Reworded')
    expect(saveLabel()).toBe('Save 1 change')
  })
})
