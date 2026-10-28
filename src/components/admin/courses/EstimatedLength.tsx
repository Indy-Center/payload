import React from 'react'
import type { UIFieldServerProps } from 'payload'
import { overrideOf, workedOutWeeks, type Weeks } from '@/courseware/estimated-weeks'
import type { Course } from '@/payload-types'

const range = ({ min, max }: Weeks) => (min === max ? `${min}` : `${min}–${max}`)

/**
 * The Details tab's estimated length: the range worked out from the live edition (0058), as text,
 * and whether the override beneath it replaces it.
 */
export async function EstimatedLength({ id, data, req }: UIFieldServerProps) {
  const course = (data ?? {}) as Partial<Course>
  const stored = id
    ? await req.payload.findByID({
        collection: 'courses',
        id,
        depth: 0,
        disableErrors: true,
        req,
        user: req.user,
        overrideAccess: false,
      })
    : null
  const worked = stored ? await workedOutWeeks(req, stored) : null
  const override = overrideOf(course)

  return (
    <div className="field-type estimated-length">
      <span className="field-label">Estimated length</span>
      <p>
        {worked
          ? `Worked out from edition ${worked.edition}: ${range(worked.weeks)} weeks`
          : 'No live edition to work it out from.'}
      </p>
      {override && (
        <p>
          {worked ? 'The override below replaces it' : 'The override below sets it'}:{' '}
          {range(override)} weeks
        </p>
      )}
    </div>
  )
}
