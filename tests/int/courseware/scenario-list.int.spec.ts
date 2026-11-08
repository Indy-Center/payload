// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientConfig } from 'payload'
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { ScenarioList } from '@/components/admin/courses/ScenarioList'
import type { ScenarioRow, ScenarioTab } from '@/components/admin/courses/scenarios'
import { AdminShell } from './modals'

/**
 * The course page's Scenarios tab in the browser: its groups (a scenario offered by two lesson
 * plans under both, those offered by none, the retired), the edition it reads, and its rows.
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

beforeEach(() => {
  // Payload's admin asking the CMS for the account's preferences.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({})),
  )
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const scenario = (name: string, data: Partial<ScenarioRow> = {}): ScenarioRow => ({
  id: name,
  name,
  studentPosition: 'XYZ_GND',
  difficulty: 'Medium',
  description: `About ${name}`,
  retired: false,
  ...data,
})

const twice = scenario('KXYZ_GND_02')
const tab: ScenarioTab = {
  edition: { number: 3, status: 'draft' },
  offered: [
    { id: 'p3', code: 'X-GC-3', title: 'Taxi out', scenarios: [twice] },
    {
      id: 'p4',
      code: 'X-GC-4',
      title: 'Taxi in the sim',
      scenarios: [twice, scenario('KXYZ_GND_01', { difficulty: 'Easy' })],
    },
  ],
  offeredByNone: [scenario('KXYZ_GND_RUSH', { difficulty: null, description: null })],
  retired: [scenario('KXYZ_TWR_OLD', { retired: true })],
}

function show(shown: ScenarioTab = tab, mayAdd = true) {
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
          React.createElement(ScenarioList, { courseId: 'c1', tab: shown, mayAdd }),
        ),
      ),
    ),
  )
}

const headings = () =>
  [...document.querySelectorAll('.scenario-list__heading')].map((each) =>
    each.textContent?.replace(/\s+/g, ' ').trim(),
  )
const group = (label: string) => document.querySelector(`section[aria-label="${label}"]`)!
const namesIn = (label: string) =>
  [...group(label).querySelectorAll('tbody tr')].map((row) => row.querySelector('td')!.textContent)

describe('the Scenarios tab', () => {
  it('names the edition it reads in one line above the groups', () => {
    show()

    expect(document.querySelector('.scenario-list__edition')!.textContent).toBe(
      'Offered by, in edition 3 (draft)',
    )
  })

  it('groups under each lesson plan in order, then offered by none, then retired', () => {
    show()

    expect(headings()).toEqual([
      'X-GC-3 Taxi out · 1 scenario',
      'X-GC-4 Taxi in the sim · 2 scenarios',
      'Offered by no lesson plan · 1 scenario',
      'Retired · 1 scenario',
    ])
  })

  it('lists a scenario offered by two lesson plans under both', () => {
    show()

    expect(namesIn('X-GC-3 Taxi out')).toEqual(['KXYZ_GND_02'])
    expect(namesIn('X-GC-4 Taxi in the sim')).toEqual(['KXYZ_GND_02', 'KXYZ_GND_01'])
    expect(namesIn('Offered by no lesson plan')).toEqual(['KXYZ_GND_RUSH'])
    expect(namesIn('Retired')).toEqual(['KXYZ_TWR_OLD'])
  })

  it('shows name, student position, difficulty and description, the description dropped on a phone', () => {
    show()

    const headers = [...group('Retired').querySelectorAll('th')]
    expect(headers.map((th) => th.textContent)).toEqual([
      'Name',
      'Student position',
      'Difficulty',
      'Description',
    ])
    expect(headers.map((th) => th.classList.contains('edition-outline__wide-only'))).toEqual([
      false,
      false,
      false,
      true,
    ])
    const cells = [...group('Retired').querySelectorAll('tbody td')].map((td) => td.textContent)
    expect(cells).toEqual(['KXYZ_TWR_OLD', 'XYZ_GND', 'Medium', 'About KXYZ_TWR_OLD'])
  })

  it('lists every scenario under offered by none, and no edition line, for a course with no editions', () => {
    show({
      edition: null,
      offered: [],
      offeredByNone: [scenario('One'), scenario('Two')],
      retired: [],
    })

    expect(document.querySelector('.scenario-list__edition')!.textContent).toBe('')
    expect(headings()).toEqual(['Offered by no lesson plan · 2 scenarios', 'Retired · 0 scenarios'])
    expect(namesIn('Offered by no lesson plan')).toEqual(['One', 'Two'])
  })

  it('offers “+ Add scenario” only to whoever may add one', () => {
    show(tab, false)
    expect(document.body.textContent).not.toContain('+ Add scenario')
    act(() => root?.unmount())
    document.body.innerHTML = ''

    show(tab, true)
    expect(document.body.textContent).toContain('+ Add scenario')
  })
})
