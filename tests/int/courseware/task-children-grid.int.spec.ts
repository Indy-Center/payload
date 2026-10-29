// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { ClientConfig } from 'payload'
import { ConfigProvider } from '@payloadcms/ui'
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { TaskChildren } from '@/courseware/task-children'
import { TaskChildrenGrid } from '@/components/admin/TaskChildrenGrid'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

const config = {
  collections: [],
  globals: [],
  routes: { admin: '/admin', api: '/api' },
} as unknown as ClientConfig

const nowhere = () => {}
const router: AppRouterInstance = {
  back: nowhere,
  forward: nowhere,
  refresh: nowhere,
  push: nowhere,
  replace: nowhere,
  prefetch: nowhere,
  bfcacheId: 'test',
}

const WithConfig = ConfigProvider as React.FC<{ config: ClientConfig; children?: React.ReactNode }>

function show({ children, retired }: Pick<TaskChildren, 'children' | 'retired'>) {
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
          React.createElement(TaskChildrenGrid, { rows: children, retired }),
        ),
      ),
    ),
  )
  return container
}

const child = (id: string, number: string, beneath = 0) => ({
  id,
  number,
  name: `Task ${number}`,
  description: `About ${number}`,
  beneath,
})

describe("a task's children grid", () => {
  it('shows number, name and description for each child, and each name opens its page', () => {
    const page = show({ children: [child('a', '2.2.1'), child('b', '2.2.2')], retired: [] })

    const rows = [...page.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent),
    )
    expect(rows).toEqual([
      ['2.2.1', 'Task 2.2.1', 'About 2.2.1'],
      ['2.2.2', 'Task 2.2.2', 'About 2.2.2'],
    ])
    expect(page.querySelector('tbody tr a')?.getAttribute('href')).toBe(
      '/admin/collections/tasks/a',
    )
    expect([...page.querySelectorAll('th')].map((cell) => cell.textContent)).toEqual([
      'Number',
      'Name',
      'Description',
    ])
  })

  it('says how many are beneath a child that has children, and nothing for one that has none', () => {
    const page = show({ children: [child('a', '1.1', 4), child('b', '1.2')], retired: [] })

    const names = [...page.querySelectorAll('tbody tr')].map((row) => row.children[1].textContent)
    expect(names).toEqual(['Task 1.14 beneath', 'Task 1.2'])
  })

  it('names the retired children in a line under the grid', () => {
    const one = show({ children: [child('a', '2.2.1')], retired: [{ number: '2.2.5', name: 'x' }] })
    expect(one.textContent).toContain('1 retired child hidden (2.2.5)')
  })

  it('pluralises and lists several retired children', () => {
    const page = show({
      children: [],
      retired: [
        { number: '2.2.2', name: 'x' },
        { number: '2.2.5', name: 'y' },
      ],
    })
    expect(page.textContent).toContain('2 retired children hidden (2.2.2, 2.2.5)')
  })

  it('has no line about retired children when there are none, and no grid when no children', () => {
    const page = show({ children: [], retired: [] })

    expect(page.textContent).not.toContain('retired')
    expect(page.querySelector('table')).toBeNull()
    expect(page.textContent).toContain('No children yet.')
  })
})
