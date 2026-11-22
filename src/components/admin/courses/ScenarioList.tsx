'use client'
import React, { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useDocumentDrawer } from '@payloadcms/ui'
import { editionLabel } from './edition-label'
import type { ScenarioRow, ScenarioTab } from './scenarios'
import { useAddDrawer } from './useAddDrawer'

type Props = {
  courseId: string
  tab: ScenarioTab
  mayAdd: boolean
}

/**
 * The Scenarios tab's groups: each lesson plan that offers scenarios ("S-GC-4 Taxi in the sim ·
 * 2 scenarios"), then "Offered by no lesson plan", then "Retired". A name opens the scenario's
 * form in a drawer; saving it keeps the drawer open and the tab reloads behind it (0071).
 */
export function ScenarioList({ courseId, tab, mayAdd }: Props) {
  const router = useRouter()
  const refresh = () => router.refresh()
  const count = (n: number) => `${n} ${n === 1 ? 'scenario' : 'scenarios'}`

  return (
    <div className="scenario-list">
      <div className="scenario-list__toolbar">
        {/* A course with no editions has no lesson plans to name: every scenario is offered by none. */}
        <p className="scenario-list__edition">
          {tab.edition ? `Offered by, in ${editionLabel(tab.edition)}` : ''}
        </p>
        {mayAdd && <AddScenario courseId={courseId} onSaved={refresh} />}
      </div>

      {tab.offered.map((plan) => (
        <section key={plan.id} className="scenario-list__group" aria-label={planName(plan)}>
          <h4 className="scenario-list__heading">
            {plan.code && <span className="scenario-list__code">{plan.code}</span>} {plan.title}{' '}
            <span className="scenario-list__count">· {count(plan.scenarios.length)}</span>
          </h4>
          <ScenarioTable scenarios={plan.scenarios} onSaved={refresh} />
        </section>
      ))}

      <section className="scenario-list__group" aria-label="Offered by no lesson plan">
        <h4 className="scenario-list__heading">
          Offered by no lesson plan{' '}
          <span className="scenario-list__count">· {count(tab.offeredByNone.length)}</span>
        </h4>
        {tab.offeredByNone.length === 0 ? (
          <p className="scenario-list__none">None.</p>
        ) : (
          <ScenarioTable scenarios={tab.offeredByNone} onSaved={refresh} />
        )}
      </section>

      <section className="scenario-list__group" aria-label="Retired">
        <h4 className="scenario-list__heading">
          Retired <span className="scenario-list__count">· {count(tab.retired.length)}</span>
        </h4>
        {tab.retired.length === 0 ? (
          <p className="scenario-list__none">None.</p>
        ) : (
          <ScenarioTable scenarios={tab.retired} onSaved={refresh} />
        )}
      </section>
    </div>
  )
}

const planName = (plan: ScenarioTab['offered'][number]) =>
  [plan.code, plan.title].filter(Boolean).join(' ') || 'A lesson plan'

/** Name, student position, difficulty and description; a phone drops the description. */
function ScenarioTable({ scenarios, onSaved }: { scenarios: ScenarioRow[]; onSaved: () => void }) {
  return (
    <table className="edition-outline__plans scenario-list__table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Student position</th>
          <th>Difficulty</th>
          <th className="edition-outline__wide-only">Description</th>
        </tr>
      </thead>
      <tbody>
        {scenarios.map((scenario) => (
          <tr key={scenario.id} className={scenario.retired ? 'scenario-list__retired' : undefined}>
            <td>
              <ScenarioLink scenario={scenario} onSaved={onSaved} />
            </td>
            <td className="edition-outline__code">{scenario.studentPosition ?? '—'}</td>
            <td>{scenario.difficulty ?? '—'}</td>
            <td className="edition-outline__wide-only scenario-list__description">
              {scenario.description ?? ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A scenario's name, opening its form in a drawer; saving keeps it open on the scenario. */
function ScenarioLink({ scenario, onSaved }: { scenario: ScenarioRow; onSaved: () => void }) {
  const [Drawer, Toggler] = useDocumentDrawer({
    collectionSlug: 'scenarios',
    id: scenario.id,
  })
  return (
    <>
      <Toggler className="edition-outline__plan-link">{scenario.name}</Toggler>
      <Drawer onSave={onSaved} />
    </>
  )
}

/**
 * "+ Add scenario": a new scenario of this course in a drawer. Saving opens the scenario it
 * created in its own drawer, in place of the new one (see `useAddDrawer`).
 */
function AddScenario({ courseId, onSaved }: { courseId: string; onSaved: () => void }) {
  const initialData = useMemo(() => ({ course: courseId }), [courseId])
  const { openDrawer, drawers } = useAddDrawer({
    collectionSlug: 'scenarios',
    initialData,
    onSaved,
  })
  return (
    <>
      <Button margin={false} size="small" onClick={openDrawer}>
        + Add scenario
      </Button>
      {drawers}
    </>
  )
}
