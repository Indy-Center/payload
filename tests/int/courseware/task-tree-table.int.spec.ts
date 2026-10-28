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
import type { TaskTreeList, TaskTreeRow } from '@/courseware/task-tree-list'
import { TaskTreeTable, useOpenTasks } from '@/components/admin/TaskTreeTable'

// React only applies updates inside act() when told it is running under test.
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

function row(id: string, number: string, parentId: string | null, hasChildren = false) {
  return {
    id,
    number,
    name: `Task ${number}`,
    description: `About ${number}`,
    retired: false,
    parentId,
    depth: number.split('.').length - 1,
    hasChildren,
  } satisfies TaskTreeRow
}

// A made-up tree three levels deep: 1 > 1.1 > 1.1.1, and 2 > 2.1.
const tree: TaskTreeList = {
  rows: [
    row('a', '1', null, true),
    row('b', '1.1', 'a', true),
    row('c', '1.1.1', 'b'),
    row('d', '2', null, true),
    row('e', '2.1', 'd'),
  ],
  opened: [],
}

const Harness = ({ list }: { list: TaskTreeList }) => {
  const { open, toggle, expandAll } = useOpenTasks(list)
  return React.createElement(
    'div',
    null,
    React.createElement('button', { onClick: expandAll }, 'Expand all'),
    React.createElement(TaskTreeTable, { rows: list.rows, open, onToggle: toggle }),
  )
}

// Its children are required in its type, which createElement's own children argument doesn't meet.
const WithConfig = ConfigProvider as React.FC<{ config: ClientConfig; children?: React.ReactNode }>

function show(list: TaskTreeList) {
  const container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  act(() =>
    root!.render(
      // Links need Next's router; this one goes nowhere.
      React.createElement(
        AppRouterContext,
        { value: router },
        React.createElement(WithConfig, { config }, React.createElement(Harness, { list })),
      ),
    ),
  )
}

/** Presses the button with this accessible name: its aria-label, or else its text. */
function press(name: string) {
  const button = [...document.querySelectorAll('button')].find(
    (each) => (each.getAttribute('aria-label') ?? each.textContent) === name,
  )
  if (!button) throw new Error(`No button "${name}"`)
  act(() => button.click())
}

const numbersShown = () =>
  [...document.querySelectorAll('tbody tr td:first-child a')].map((cell) => cell.textContent)

describe('the task tree table', () => {
  it('opens with top-level tasks closed', () => {
    show(tree)

    expect(numbersShown()).toEqual(['1', '2'])
  })

  it('opens and closes each task on its own', () => {
    show(tree)

    press('Open 1 Task 1')
    expect(numbersShown()).toEqual(['1', '1.1', '2'])

    press('Open 1.1 Task 1.1')
    expect(numbersShown()).toEqual(['1', '1.1', '1.1.1', '2'])

    press('Close 1 Task 1')
    expect(numbersShown()).toEqual(['1', '2'])
  })

  it('opens every task with "Expand all"', () => {
    show(tree)

    press('Expand all')

    expect(numbersShown()).toEqual(['1', '1.1', '1.1.1', '2', '2.1'])
  })

  it('starts with the parents a search opened', () => {
    show({ rows: tree.rows.slice(0, 3), opened: ['a', 'b'] })

    expect(numbersShown()).toEqual(['1', '1.1', '1.1.1'])
  })

  it('links each task to its page, and marks the description to drop at phone width', () => {
    show(tree)

    const link = [...document.querySelectorAll('a')].find((each) => each.textContent === 'Task 2')
    expect(link?.getAttribute('href')).toBe('/admin/collections/tasks/d')
    const description = [...document.querySelectorAll('td')].find(
      (cell) => cell.textContent === 'About 2',
    )
    expect(description?.classList).toContain('task-tree__description')
  })
})
