// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientConfig, ServerFunctionClient } from 'payload'
import { useDocumentDrawerContext } from '@payloadcms/ui'
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { EditionOutline } from '@/components/admin/courses/EditionOutline'
import type { EditionOutline as Outline, OutlinePlan } from '@/components/admin/courses/editions'
import { ScenarioList } from '@/components/admin/courses/ScenarioList'
import type { ScenarioRow, ScenarioTab } from '@/components/admin/courses/scenarios'
import { AdminShell } from './modals'

/**
 * Save only saves (0071): the lesson plan and scenario drawers stay open on save, the tab behind
 * them refreshes, and an "add" drawer goes on to edit the record it created, in that record's own
 * drawer. Payload's own drawer is drawn; its `closeDrawer` is watched, and the CMS's
 * `render-document` answers with a stand-in form whose Save reports what Payload's form reports.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { closed } = vi.hoisted(() => ({ closed: { count: 0 } }))

vi.mock('@payloadcms/ui', async (importOriginal) => {
  const real = await importOriginal<typeof import('@payloadcms/ui')>()
  return {
    ...real,
    useDocumentDrawer: (args: Parameters<typeof real.useDocumentDrawer>[0]) => {
      const [Drawer, Toggler, state] = real.useDocumentDrawer(args)
      const closeDrawer = () => {
        closed.count += 1
        state.closeDrawer()
      }
      return [Drawer, Toggler, { ...state, closeDrawer }]
    },
  }
})

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

/** The id the CMS gives a record an "add" drawer creates. */
const CREATED = 'created-1'

/**
 * A stand-in for Payload's form in a drawer: which record it edits, and its Save. Like Payload's,
 * a create form that has saved keeps its own permissions, worked out with no record: for a course
 * author, no Save. Payload's drawer swaps the created record's form into that same form, so only a
 * form drawn afresh for the record can be saved again.
 */
function StandInForm({ id }: { id?: string }) {
  const { onSave } = useDocumentDrawerContext()
  const [maySave, setMaySave] = React.useState(true)
  return React.createElement(
    'div',
    { className: 'stand-in-form' },
    React.createElement('p', null, id ? `Editing ${id}` : 'Creating'),
    maySave &&
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => {
            onSave?.({
              doc: { id: id ?? CREATED },
              operation: id ? 'update' : 'create',
            } as unknown as Parameters<NonNullable<typeof onSave>>[0])
            if (!id) setMaySave(false)
          },
        },
        'Save the form',
      ),
  )
}

/** How many drawers are open on a form, and whether the open one can be saved. */
const openForms = () => document.querySelectorAll('.stand-in-form').length
const maySave = () => document.querySelector('.stand-in-form button') !== null

let serverFunction: ReturnType<typeof vi.fn>
let root: Root | null = null

beforeEach(() => {
  closed.count = 0
  router.refresh = vi.fn()
  serverFunction = vi.fn(async ({ name, args }: { name: string; args: { docID?: string } }) =>
    name === 'render-document'
      ? { Document: React.createElement(StandInForm, { id: args.docID }) }
      : {},
  )
  // Payload's admin asking the CMS for the account's preferences.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({})),
  )
  window.history.replaceState(null, '', '/admin/collections/courses/c1/content')
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function draw(element: React.ReactElement) {
  act(() =>
    root!.render(
      React.createElement(
        AppRouterContext,
        { value: router },
        React.createElement(
          AdminShell,
          { config, serverFunction: serverFunction as unknown as ServerFunctionClient },
          element,
        ),
      ),
    ),
  )
}

function show(element: React.ReactElement) {
  root = createRoot(document.body.appendChild(document.createElement('div')))
  draw(element)
}

function button(name: string) {
  const found = [...document.querySelectorAll('button')].find(
    (each) => each.textContent?.trim() === name,
  )
  if (!found) throw new Error(`No button "${name}"`)
  return found as HTMLButtonElement
}

async function press(name: string) {
  await act(async () => button(name).click())
  // The drawer asks the CMS for its form, and draws it once that answers.
  await act(async () => {})
}

/** What the open drawer's form edits: "Editing ⟨id⟩", "Creating", or null with no drawer open. */
const drawer = () => document.querySelector('.stand-in-form p')?.textContent ?? null

const rendered = () =>
  serverFunction.mock.calls
    .filter(([call]) => call.name === 'render-document')
    .map(([call]) => call.args.docID ?? null)

const plan = (id: string): OutlinePlan => ({
  id,
  code: id.toUpperCase(),
  title: `Plan ${id}`,
  minutes: 45,
  tasks: { all: 8, required: 6 },
  scenarios: [],
  resources: 0,
})

const outline = (plans: OutlinePlan[]): Outline => ({
  id: 'e1',
  updatedAt: '2026-11-08T10:00:00.000Z',
  title: 'X-GC edition 2',
  number: 2,
  gradingScale: 'Three point',
  defaultMinimum: 2,
  completionStandard: 'Finish them all.',
  modules: [{ key: 'm1', title: 'Getting started', description: null, lessonPlans: plans }],
  unplaced: [],
  ownLessonPlans: plans.length,
})

const contentTab = (plans: OutlinePlan[]) =>
  React.createElement(EditionOutline, { edition: outline(plans), editable: true, rearrange: true })

const scenario = (id: string, name: string): ScenarioRow => ({
  id,
  name,
  studentPosition: 'XYZ_GND',
  description: null,
  retired: false,
})

const scenariosTab = (scenarios: ScenarioRow[]) => {
  const tab: ScenarioTab = { edition: null, offered: [], offeredByNone: scenarios, retired: [] }
  return React.createElement(ScenarioList, { courseId: 'c1', tab, mayAdd: true })
}

describe('the lesson plan drawer on the Content tab', () => {
  it('stays open on the lesson plan when saved, and the tab refreshes', async () => {
    show(contentTab([plan('x-1')]))

    await press('Plan x-1')
    expect(drawer()).toBe('Editing x-1')
    await press('Save the form')

    expect(drawer()).toBe('Editing x-1')
    expect(closed.count).toBe(0)
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })

  it('stays open, unchanged, when the refreshed tab is drawn behind it', async () => {
    show(contentTab([plan('x-1')]))
    await press('Plan x-1')
    await press('Save the form')

    draw(contentTab([{ ...plan('x-1'), title: 'Plan x-1, reworded' }]))

    expect(drawer()).toBe('Editing x-1')
    expect(rendered()).toEqual(['x-1'])
  })
})

describe('“+ Add lesson plan”', () => {
  it('opens the lesson plan it created in its own drawer when saved, and the tab refreshes', async () => {
    show(contentTab([plan('x-1')]))

    await press('+ Add lesson plan')
    expect(drawer()).toBe('Creating')
    await press('Save the form')

    expect(drawer()).toBe(`Editing ${CREATED}`)
    expect(openForms()).toBe(1)
    expect(maySave()).toBe(true)
    expect(rendered().at(-1)).toBe(CREATED)
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })

  it('goes on editing the created lesson plan when the refreshed tab lists it', async () => {
    show(contentTab([plan('x-1')]))
    await press('+ Add lesson plan')
    await press('Save the form')
    const renders = rendered().length

    draw(contentTab([plan('x-1'), plan(CREATED)]))

    expect(drawer()).toBe(`Editing ${CREATED}`)
    await press('Save the form')
    expect(drawer()).toBe(`Editing ${CREATED}`)
    expect(maySave()).toBe(true)
    expect(rendered()).toHaveLength(renders)
    expect(router.refresh).toHaveBeenCalledTimes(2)
  })
})

describe('the scenario drawer on the Scenarios tab', () => {
  it('stays open on the scenario when saved, and the tab refreshes', async () => {
    show(scenariosTab([scenario('s1', 'KXYZ_GND_01')]))

    await press('KXYZ_GND_01')
    expect(drawer()).toBe('Editing s1')
    await press('Save the form')

    expect(drawer()).toBe('Editing s1')
    expect(closed.count).toBe(0)
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })

  it('stays open, unchanged, when the refreshed tab is drawn behind it', async () => {
    show(scenariosTab([scenario('s1', 'KXYZ_GND_01')]))
    await press('KXYZ_GND_01')
    await press('Save the form')

    draw(scenariosTab([{ ...scenario('s1', 'KXYZ_GND_01'), description: 'Pushes in the rush' }]))

    expect(drawer()).toBe('Editing s1')
    expect(rendered()).toEqual(['s1'])
  })
})

describe('“+ Add scenario”', () => {
  it('opens the scenario it created in its own drawer when saved, and the tab refreshes', async () => {
    show(scenariosTab([scenario('s1', 'KXYZ_GND_01')]))

    await press('+ Add scenario')
    expect(drawer()).toBe('Creating')
    await press('Save the form')

    expect(drawer()).toBe(`Editing ${CREATED}`)
    expect(openForms()).toBe(1)
    expect(maySave()).toBe(true)
    expect(rendered().at(-1)).toBe(CREATED)
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })

  it('goes on editing the created scenario when the refreshed tab lists it', async () => {
    show(scenariosTab([scenario('s1', 'KXYZ_GND_01')]))
    await press('+ Add scenario')
    await press('Save the form')
    const renders = rendered().length

    draw(scenariosTab([scenario('s1', 'KXYZ_GND_01'), scenario(CREATED, 'KXYZ_GND_02')]))

    expect(drawer()).toBe(`Editing ${CREATED}`)
    await press('Save the form')
    expect(drawer()).toBe(`Editing ${CREATED}`)
    expect(maySave()).toBe(true)
    expect(rendered()).toHaveLength(renders)
    expect(router.refresh).toHaveBeenCalledTimes(2)
  })
})
