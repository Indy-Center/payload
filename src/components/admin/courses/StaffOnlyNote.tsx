import React from 'react'
import type { UIFieldServerProps } from 'payload'
import { isStaff } from '@/courseware/access'
import type { User } from '@/payload-types'

/**
 * The line a course author sees over the Details tab, which they read but cannot change: a
 * course's fields are the Training Admin's and leads' (0054, ticket 07).
 */
export function StaffOnlyNote({ req }: UIFieldServerProps) {
  if (isStaff(req.user as User | null)) return null
  return <p className="staff-only-note">Only the Training Admin and leads change these.</p>
}
