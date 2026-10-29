'use client'
import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, toast, useDocumentDrawer } from '@payloadcms/ui'
import type { EditionOutline as Outline, OutlinePlan } from './editions'
import { useEndpoint } from '../useEndpoint'

type Props = {
  edition: Outline
  /** On Content: the edition's form and its lesson plans open in drawers. In History, text. */
  editable: boolean
  /** Whether the person may change the outline: add, reorder, move and remove lesson plans. */
  rearrange?: boolean
  /** Why they may not, shown once above the modules ("Structural changes … made by a lead"). */
  structuralNote?: string | null
}

/**
 * An edition's outline: its completion standard first, then its grading scale and modules, each
 * listing its lesson plans in order, and last the edition's lesson plans in no module. Editable,
 * it opens the edition's own form and each lesson plan's in a drawer over the course page, and
 * adds, reorders, moves and removes lesson plans in place (ticket 21); the server checks each
 * change against the edition's rules. Read-only, it is text.
 */
export function EditionOutline({ edition, editable, rearrange = false, structuralNote }: Props) {
  const router = useRouter()
  const refresh = () => router.refresh()
  const call = useEndpoint()
  const [busy, setBusy] = useState(false)
  const [EditionDrawer, , { openDrawer }] = useDocumentDrawer({
    collectionSlug: 'course-versions',
    id: edition.id,
  })
  const controls = editable && rearrange

  /** Runs one outline change, then shows the outline as saved, or the refusal. */
  const change = async (path: string, body: unknown) => {
    setBusy(true)
    const outcome = await call(path, 'post', body)
    setBusy(false)
    if (!outcome.ok) return outcome.messages.forEach((message) => toast.error(message))
    refresh()
  }
  const move = (plan: OutlinePlan, direction: 'up' | 'down') =>
    change(`/courseware/lesson-plans/${plan.id}/move`, { direction })
  const place = (plan: OutlinePlan, module: string | null) =>
    change(`/courseware/lesson-plans/${plan.id}/module`, { module })

  const rowsProps = { editable, onSaved: refresh }

  return (
    <div className="edition-outline">
      <dl className="edition-outline__facts">
        <div className="edition-outline__wide">
          <dt>Completion standard</dt>
          <dd>{edition.completionStandard || 'None yet'}</dd>
        </div>
        <div>
          <dt>Grading scale</dt>
          <dd>{edition.gradingScale ?? 'None yet'}</dd>
        </div>
        <div>
          <dt>Default minimum grade</dt>
          <dd>{edition.defaultMinimum ?? 'None yet'}</dd>
        </div>
      </dl>

      <div className="edition-outline__heading">
        <h3>Modules</h3>
        {editable && (
          <>
            <Button buttonStyle="secondary" margin={false} size="small" onClick={openDrawer}>
              Edit edition
            </Button>
            <EditionDrawer onSave={refresh} />
          </>
        )}
      </div>
      {editable && !rearrange && structuralNote && (
        <p className="edition-outline__structural">{structuralNote}</p>
      )}

      {edition.modules.length === 0 ? (
        <p className="edition-outline__none">No modules yet.</p>
      ) : (
        <ol className="edition-outline__modules">
          {edition.modules.map((module) => (
            <li key={module.key} className="edition-outline__module">
              <div className="edition-outline__module-heading">
                <h4>{module.title}</h4>
                {editable && (
                  <AddLessonPlan
                    edition={edition}
                    moduleId={module.key}
                    disabled={!rearrange || busy}
                    onSaved={refresh}
                  />
                )}
              </div>
              {module.description && <p>{module.description}</p>}
              {module.lessonPlans.length === 0 ? (
                <p className="edition-outline__none">No lesson plans.</p>
              ) : (
                <PlanTable
                  {...rowsProps}
                  plans={module.lessonPlans}
                  label={`Lesson plans in ${module.title}`}
                  actionsHeading="Order"
                  actions={(plan, index) => (
                    <>
                      <Button
                        buttonStyle="secondary"
                        margin={false}
                        size="small"
                        aria-label={`Move ${nameOf(plan)} up`}
                        disabled={!controls || busy || index === 0}
                        onClick={() => move(plan, 'up')}
                      >
                        ↑
                      </Button>
                      <Button
                        buttonStyle="secondary"
                        margin={false}
                        size="small"
                        aria-label={`Move ${nameOf(plan)} down`}
                        disabled={!controls || busy || index === module.lessonPlans.length - 1}
                        onClick={() => move(plan, 'down')}
                      >
                        ↓
                      </Button>
                      <Button
                        buttonStyle="secondary"
                        margin={false}
                        size="small"
                        disabled={!controls || busy}
                        onClick={() => place(plan, null)}
                      >
                        Remove from module
                      </Button>
                    </>
                  )}
                />
              )}
            </li>
          ))}
        </ol>
      )}

      {editable && edition.unplaced.length > 0 && (
        <section className="edition-outline__unplaced" aria-labelledby="not-in-a-module">
          <h4 id="not-in-a-module">Not in a module</h4>
          <PlanTable
            {...rowsProps}
            plans={edition.unplaced}
            label="Lesson plans not in a module"
            actionsHeading="Module"
            actions={(plan) =>
              edition.modules.length > 0 && (
                <select
                  className="edition-outline__put"
                  aria-label={`Put ${nameOf(plan)} in a module`}
                  value=""
                  disabled={!controls || busy}
                  onChange={(event) => event.target.value && place(plan, event.target.value)}
                >
                  <option value="">Put in module…</option>
                  {edition.modules.map((module) => (
                    <option key={module.key} value={module.key}>
                      {module.title}
                    </option>
                  ))}
                </select>
              )
            }
          />
        </section>
      )}
    </div>
  )
}

const nameOf = (plan: OutlinePlan) => plan.code || plan.title || 'this lesson plan'

/** A list of lesson plans: code, title, minutes, theory items, and what may be done to each. */
function PlanTable({
  plans,
  label,
  editable,
  actionsHeading,
  actions,
  onSaved,
}: {
  plans: OutlinePlan[]
  label: string
  editable: boolean
  actionsHeading: string
  actions: (plan: OutlinePlan, index: number) => React.ReactNode
  onSaved: () => void
}) {
  return (
    <table className="edition-outline__plans" aria-label={label}>
      <thead>
        <tr>
          <th>Code</th>
          <th>Title</th>
          <th className="edition-outline__wide-only">Minutes</th>
          <th className="edition-outline__wide-only">Theory items</th>
          {editable && <th>{actionsHeading}</th>}
        </tr>
      </thead>
      <tbody>
        {plans.map((plan, index) => (
          <tr key={plan.id}>
            {editable ? (
              <PlanCells plan={plan} onSaved={onSaved} />
            ) : (
              <>
                <td className="edition-outline__code">{plan.code}</td>
                <td>{plan.title ?? (plan.code ? '' : 'Untitled lesson plan')}</td>
              </>
            )}
            <td className="edition-outline__wide-only">{plan.minutes ?? '—'}</td>
            <td className="edition-outline__wide-only">{plan.theoryItems}</td>
            {editable && (
              <td>
                <div className="edition-outline__actions">{actions(plan, index)}</div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A lesson plan's code and title, each opening its form in a drawer; saving closes it. */
function PlanCells({ plan, onSaved }: { plan: OutlinePlan; onSaved: () => void }) {
  const [Drawer, Toggler, { closeDrawer }] = useDocumentDrawer({
    collectionSlug: 'lesson-plans',
    id: plan.id,
  })
  return (
    <>
      <td className="edition-outline__code">
        {plan.code && <Toggler className="edition-outline__plan-link">{plan.code}</Toggler>}
      </td>
      <td>
        <Toggler className="edition-outline__plan-link">
          {plan.title ?? (plan.code ? '' : 'Untitled lesson plan')}
        </Toggler>
        <Drawer
          onSave={() => {
            closeDrawer()
            onSaved()
          }}
        />
      </td>
    </>
  )
}

/**
 * "Add lesson plan": a new lesson plan in a drawer, already of this edition and in this module
 * (placed last when saved), its minimum starting from the edition's default.
 */
function AddLessonPlan({
  edition,
  moduleId,
  disabled,
  onSaved,
}: {
  edition: Outline
  moduleId: string
  disabled: boolean
  onSaved: () => void
}) {
  const [Drawer, , { openDrawer, closeDrawer }] = useDocumentDrawer({
    collectionSlug: 'lesson-plans',
  })
  const initialData = useMemo(
    () => ({ courseVersion: edition.id, module: moduleId, minimum: edition.defaultMinimum }),
    [edition.id, edition.defaultMinimum, moduleId],
  )
  return (
    <>
      <Button
        buttonStyle="secondary"
        margin={false}
        size="small"
        disabled={disabled}
        onClick={openDrawer}
      >
        Add lesson plan
      </Button>
      <Drawer
        initialData={initialData}
        onSave={() => {
          closeDrawer()
          onSaved()
        }}
      />
    </>
  )
}
