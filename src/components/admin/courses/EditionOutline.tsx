'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import { Button, useDocumentDrawer } from '@payloadcms/ui'
import type { EditionOutline as Outline } from './editions'

/**
 * An edition's outline: its grading scale, completion standard and modules with their lesson
 * plans. Editable, it opens the edition's own form and each lesson plan's in a drawer over the
 * course page, whose access rules say what the person may change; read-only, it is text.
 */
export function EditionOutline({ edition, editable }: { edition: Outline; editable: boolean }) {
  const router = useRouter()
  const refresh = () => router.refresh()
  const [EditionDrawer, , { openDrawer }] = useDocumentDrawer({
    collectionSlug: 'course-versions',
    id: edition.id,
  })

  return (
    <div className="edition-outline">
      <dl className="edition-outline__facts">
        <div>
          <dt>Grading scale</dt>
          <dd>{edition.gradingScale ?? 'None yet'}</dd>
        </div>
        <div>
          <dt>Default minimum grade</dt>
          <dd>{edition.defaultMinimum ?? 'None yet'}</dd>
        </div>
        {edition.completionStandard && (
          <div className="edition-outline__wide">
            <dt>Completion standard</dt>
            <dd>{edition.completionStandard}</dd>
          </div>
        )}
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

      {edition.modules.length === 0 ? (
        <p className="edition-outline__none">No modules yet.</p>
      ) : (
        <ol className="edition-outline__modules">
          {edition.modules.map((module) => (
            <li key={module.key} className="edition-outline__module">
              <h4>{module.title}</h4>
              {module.description && <p>{module.description}</p>}
              {module.lessonPlans.length === 0 ? (
                <p className="edition-outline__none">No lesson plans.</p>
              ) : (
                <ol className="edition-outline__plans">
                  {module.lessonPlans.map((plan) => (
                    <li key={plan.id}>
                      {editable ? (
                        <LessonPlanLink plan={plan} onSave={refresh} />
                      ) : (
                        <PlanName plan={plan} />
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

type Plan = Outline['modules'][number]['lessonPlans'][number]

const PlanName = ({ plan }: { plan: Plan }) => (
  <>
    {plan.code && <span className="edition-outline__code">{plan.code}</span>}{' '}
    {plan.title ?? (plan.code ? '' : 'Untitled lesson plan')}
  </>
)

function LessonPlanLink({ plan, onSave }: { plan: Plan; onSave: () => void }) {
  const [Drawer, Toggler] = useDocumentDrawer({ collectionSlug: 'lesson-plans', id: plan.id })
  return (
    <>
      <Toggler className="edition-outline__plan-link">
        <PlanName plan={plan} />
      </Toggler>
      <Drawer onSave={onSave} />
    </>
  )
}
