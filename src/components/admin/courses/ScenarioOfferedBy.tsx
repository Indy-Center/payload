import React from 'react'
import type { UIFieldServerProps } from 'payload'
import { loadOfferedBy } from './scenarios'
import { editionLabel } from './edition-label'

/**
 * Read-only on a scenario's form: which lesson plans offer it, in the edition the course page's
 * Scenarios tab reads (the draft, else the live one), and that this is set on the lesson plan.
 */
export async function ScenarioOfferedBy({ data, id, req }: UIFieldServerProps) {
  if (!id) return null
  const { edition, plans } = await loadOfferedBy(req, {
    id: String(id),
    course: data?.course as string | { id: string } | null,
  })
  return (
    <div className="field-type scenario-offered-by">
      <span className="lesson-plan-fixed__label">Offered by</span>
      {!edition ? (
        <p className="scenario-offered-by__none">The course has no editions yet.</p>
      ) : plans.length === 0 ? (
        <p className="scenario-offered-by__none">No lesson plan in {editionLabel(edition)}.</p>
      ) : (
        <ul className="scenario-offered-by__plans">
          {plans.map((plan, at) => (
            <li key={at}>
              {plan.code && <span className="edition-outline__code">{plan.code}</span>} {plan.title}
            </li>
          ))}
        </ul>
      )}
      <p className="field-description">Set on each lesson plan’s “Scenarios offered”.</p>
    </div>
  )
}
