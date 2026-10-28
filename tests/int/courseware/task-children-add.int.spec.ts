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
import { TaskChildren } from '@/components/admin/TaskChildren'

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

function show(props: { mayAdd: boolean; taskRetired?: boolean }) {
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
          React.createElement(TaskChildren, {
            taskId: 't',
            rows: [],
            retired: [],
            taskRetired: false,
            // The real button opens a drawer, which needs Payload's whole admin shell.
            AddChild: () => React.createElement('button', null, 'Add child'),
            ...props,
          }),
        ),
      ),
    ),
  )
  return container
}

const hasAddChild = (page: HTMLElement) =>
  [...page.querySelectorAll('button')].some((button) => button.textContent === 'Add child')

describe('the Add child button', () => {
  it('shows to the Training Admin and leads', () => {
    expect(hasAddChild(show({ mayAdd: true }))).toBe(true)
  })

  it('does not show to anyone else', () => {
    expect(hasAddChild(show({ mayAdd: false }))).toBe(false)
  })

  it('does not show on a retired task, even to the staff', () => {
    expect(hasAddChild(show({ mayAdd: true, taskRetired: true }))).toBe(false)
  })
})
