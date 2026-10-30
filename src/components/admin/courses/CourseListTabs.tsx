'use client'
import React from 'react'
import Link from 'next/link'
import { useConfig, useListDrawerContext } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'

/**
 * The Courses list's two tabs, Courses and Credentials (ticket 22). Each is its own address, so
 * coming back from a credential finds the tab again. Not shown when the list opens in a drawer.
 */
export function CourseListTabs({ current }: { current: 'courses' | 'credentials' }) {
  const {
    config: { routes },
  } = useConfig()
  const { isInDrawer } = useListDrawerContext()
  if (isInDrawer) return null

  const coursesURL = formatAdminURL({ adminRoute: routes.admin, path: '/collections/courses' })
  const tabs = [
    { key: 'courses', label: 'Courses', href: coursesURL },
    { key: 'credentials', label: 'Credentials', href: `${coursesURL}?tab=credentials` },
  ] as const

  return (
    <nav className="course-list-tabs" aria-label="Courses list">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className="course-list-tabs__tab"
          aria-current={tab.key === current ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
