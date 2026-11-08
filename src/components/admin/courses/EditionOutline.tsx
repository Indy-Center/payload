'use client'
import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, toast, useDocumentDrawer, useModal } from '@payloadcms/ui'
import { STALE_OUTLINE } from '@/courseware/outline-messages'
import type { EditionOutline as Outline, OutlinePlan } from './editions'
import { AskFirst } from './EditionActions'
import { ModuleForm, type ModuleWording } from './ModuleForm'
import { confirmLeave } from '../LeaveGuard'
import { useEndpoint } from '../useEndpoint'

type Props = {
  edition: Outline
  /** On Content: the edition's form and its lesson plans open in drawers. In History, text. */
  editable: boolean
  /**
   * Whether the person may change the outline: add, delete and reorder modules, and add, reorder,
   * move and remove lesson plans.
   */
  rearrange?: boolean
  /** Whether they may reword modules, which a course author may in a published edition (0055). */
  reword?: boolean
  /** Why they may not rearrange, shown once above the modules ("… made by a lead"). */
  structuralNote?: string | null
}

type Module = Outline['modules'][number]
/** The module open for editing: its key, or `new` for one "+ Add module" opened. */
type Editing = string | 'new' | null

/**
 * An edition's outline: its completion standard, grading scale and default minimum, with "Edit
 * grading and completion" beside them; then its modules, each with its lesson plans in order; and
 * last the edition's lesson plans in no module. Editable, a module is reworded in place, one at a
 * time, with Save and Cancel; modules and lesson plans are added, reordered, moved and removed in
 * place, each saved at once; the edition's form and each lesson plan's open in drawers. Every
 * outline change sends the edition's `updatedAt` as this screen has it, and one refused because
 * someone saved the edition since reloads the page. Read-only, it is text.
 */
export function EditionOutline({
  edition,
  editable,
  rearrange = false,
  reword = rearrange,
  structuralNote,
}: Props) {
  const router = useRouter()
  const refresh = () => router.refresh()
  const call = useEndpoint()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  // The edition's save this screen shows: the page's, or that of the change made from it last,
  // until the page reloads with a newer one.
  const [made, setMade] = useState<{ over: string; updatedAt: string } | null>(null)
  const version = made?.over === edition.updatedAt ? made.updatedAt : edition.updatedAt
  const [EditionDrawer, , { openDrawer }] = useDocumentDrawer({
    collectionSlug: 'course-versions',
    id: edition.id,
  })
  const controls = editable && rearrange

  /** Runs one outline change, then shows the outline as saved, or the refusal. */
  const change = async (path: string, body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true)
    const outcome = await call(path, 'post', { ...body, updatedAt: version })
    setBusy(false)
    if (!outcome.ok) {
      outcome.messages.forEach((message) => toast.error(message))
      if (outcome.messages.includes(STALE_OUTLINE)) {
        setEditing(null)
        refresh()
      }
      return false
    }
    if (typeof outcome.body.updatedAt === 'string') {
      setMade({ over: edition.updatedAt, updatedAt: outcome.body.updatedAt })
    }
    refresh()
    return true
  }
  const modulesPath = `/courseware/course-versions/${edition.id}/modules`
  const move = (plan: OutlinePlan, direction: 'up' | 'down') =>
    change(`/courseware/lesson-plans/${plan.id}/move`, { direction })
  const place = (plan: OutlinePlan, module: string | null) =>
    change(`/courseware/lesson-plans/${plan.id}/module`, { module })
  const moveModule = (module: Module, direction: 'up' | 'down') =>
    change(`${modulesPath}/${module.key}/move`, { direction })
  const saveModule = async (key: string | 'new', wording: ModuleWording) => {
    const saved = await change(key === 'new' ? modulesPath : `${modulesPath}/${key}`, wording)
    if (saved) setEditing(null)
    return saved
  }
  /** Opens a module's form, or a new one, asking first if another holds changes. */
  const open = (key: Editing) => confirmLeave(() => setEditing(key))

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
        {editable && (
          <div className="edition-outline__wide">
            {/* The edition's own fields are the staff's in a published edition: greyed out with
                the structural controls for whoever may only reword its modules. */}
            <Button
              buttonStyle="secondary"
              margin={false}
              size="small"
              disabled={!rearrange}
              onClick={openDrawer}
            >
              Edit grading and completion
            </Button>
            <EditionDrawer onSave={refresh} />
          </div>
        )}
      </dl>

      <div className="edition-outline__heading">
        <h3>Modules</h3>
      </div>
      {editable && !rearrange && structuralNote && (
        <p className="edition-outline__structural">{structuralNote}</p>
      )}

      {edition.modules.length === 0 && editing !== 'new' ? (
        <p className="edition-outline__none">No modules yet.</p>
      ) : (
        <ol className="edition-outline__modules">
          {edition.modules.map((module, index) => (
            <li key={module.key} className="edition-outline__module">
              <div className="edition-outline__module-heading">
                <div className="edition-outline__module-text">
                  {editing === module.key ? (
                    <h4 className="edition-outline__editing">Editing {module.title}</h4>
                  ) : (
                    <>
                      <h4>{module.title}</h4>
                      {module.description && <p>{module.description}</p>}
                    </>
                  )}
                </div>
                {editable && (
                  <div className="edition-outline__actions">
                    <Button
                      buttonStyle="secondary"
                      margin={false}
                      size="small"
                      aria-label={`Move ${module.title} up`}
                      disabled={!controls || busy || index === 0}
                      onClick={() => moveModule(module, 'up')}
                    >
                      ↑
                    </Button>
                    <Button
                      buttonStyle="secondary"
                      margin={false}
                      size="small"
                      aria-label={`Move ${module.title} down`}
                      disabled={!controls || busy || index === edition.modules.length - 1}
                      onClick={() => moveModule(module, 'down')}
                    >
                      ↓
                    </Button>
                    {editing !== module.key && (
                      <Button
                        buttonStyle="secondary"
                        margin={false}
                        size="small"
                        aria-label={`Edit ${module.title}`}
                        disabled={!reword || busy}
                        onClick={() => open(module.key)}
                      >
                        Edit
                      </Button>
                    )}
                    <DeleteModule
                      module={module}
                      others={edition.modules.filter((other) => other.key !== module.key)}
                      disabled={!controls || busy}
                      onDelete={(lessonPlansTo) =>
                        change(`${modulesPath}/${module.key}/delete`, { lessonPlansTo })
                      }
                    />
                  </div>
                )}
              </div>
              {editing === module.key && (
                <ModuleForm
                  saved={{ title: module.title, description: module.description ?? '' }}
                  isNew={false}
                  onSave={(wording) => saveModule(module.key, wording)}
                  onCancel={() => setEditing(null)}
                />
              )}
              <div className="edition-outline__plans-heading">
                <strong>Lesson plans</strong>
                {editable && (
                  <AddLessonPlan
                    edition={edition}
                    moduleId={module.key}
                    disabled={!rearrange || busy}
                    onSaved={refresh}
                  />
                )}
              </div>
              {module.lessonPlans.length === 0 ? (
                <p className="edition-outline__none">No lesson plans.</p>
              ) : (
                <PlanTable
                  {...rowsProps}
                  plans={module.lessonPlans}
                  label={`Lesson plans in ${module.title}`}
                  actionsHeading="Order"
                  actions={(plan, at) => (
                    <>
                      <Button
                        buttonStyle="secondary"
                        margin={false}
                        size="small"
                        aria-label={`Move ${nameOf(plan)} up`}
                        disabled={!controls || busy || at === 0}
                        onClick={() => move(plan, 'up')}
                      >
                        ↑
                      </Button>
                      <Button
                        buttonStyle="secondary"
                        margin={false}
                        size="small"
                        aria-label={`Move ${nameOf(plan)} down`}
                        disabled={!controls || busy || at === module.lessonPlans.length - 1}
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
          {editing === 'new' && (
            <li className="edition-outline__module">
              <h4 className="edition-outline__editing">New module</h4>
              <ModuleForm
                saved={{ title: '', description: '' }}
                isNew
                onSave={(wording) => saveModule('new', wording)}
                onCancel={() => setEditing(null)}
              />
            </li>
          )}
        </ol>
      )}
      {editable && editing !== 'new' && (
        <div>
          <Button
            buttonStyle="secondary"
            margin={false}
            size="small"
            disabled={!controls || busy}
            onClick={() => open('new')}
          >
            + Add module
          </Button>
        </div>
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

/** "A, B and C" */
const listed = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/**
 * A module's Delete: a confirm, "Delete ⟨title⟩?". One that holds lesson plans names them and asks
 * where they go: "Not in a module" (the default) or the end of another module. None is deleted.
 */
function DeleteModule({
  module,
  others,
  disabled,
  onDelete,
}: {
  module: Module
  others: Module[]
  disabled: boolean
  onDelete: (lessonPlansTo: string | null) => Promise<boolean>
}) {
  const slug = `delete-module-${module.key}`
  const { openModal, closeModal } = useModal()
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const plans = module.lessonPlans
  const name = module.title || 'this module'

  const remove = async () => {
    setBusy(true)
    const deleted = await onDelete(to || null)
    setBusy(false)
    if (deleted) closeModal(slug)
  }

  return (
    <>
      <Button
        buttonStyle="secondary"
        margin={false}
        size="small"
        aria-label={`Delete ${module.title}`}
        disabled={disabled}
        onClick={() => {
          setTo('')
          openModal(slug)
        }}
      >
        Delete
      </Button>
      <AskFirst
        slug={slug}
        heading={`Delete ${name}?`}
        actions={
          <>
            <Button
              buttonStyle="secondary"
              size="large"
              disabled={busy}
              onClick={() => closeModal(slug)}
            >
              Cancel
            </Button>
            <Button size="large" disabled={busy} onClick={remove}>
              Delete module
            </Button>
          </>
        }
      >
        {plans.length === 0 ? (
          <p>It holds no lesson plans.</p>
        ) : (
          <>
            <p>
              Where do its {plans.length} lesson {plans.length === 1 ? 'plan' : 'plans'} go?{' '}
              {listed(plans.map(nameOf))}. No lesson plan is deleted.
            </p>
            <select
              className="edition-outline__put"
              aria-label={`Where ${name}’s lesson plans go`}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            >
              <option value="">Not in a module</option>
              {others.map((other) => (
                <option key={other.key} value={other.key}>
                  To the end of {other.title}
                </option>
              ))}
            </select>
          </>
        )}
      </AskFirst>
    </>
  )
}

/** A lesson plan's tasks as a row shows them: "8 (6 required)", or none and what that stops. */
export function PlanTasks({ tasks }: { tasks: OutlinePlan['tasks'] }) {
  if (tasks.all === 0) {
    return (
      <>
        <span className="edition-outline__no-tasks">None</span>
        <span className="edition-outline__publish-needs">Publish needs one</span>
      </>
    )
  }
  return (
    <>
      {tasks.all} <span className="edition-outline__muted">({tasks.required} required)</span>
    </>
  )
}

/**
 * A list of lesson plans: code, title, minutes, tasks, the scenarios offered and resources, and
 * what may be done to each. A phone keeps code, title and the actions.
 */
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
          <th className="edition-outline__wide-only">Tasks</th>
          <th className="edition-outline__wide-only">Scenarios</th>
          <th className="edition-outline__wide-only">Resources</th>
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
            <td className="edition-outline__wide-only" data-column="tasks">
              <PlanTasks tasks={plan.tasks} />
            </td>
            <td className="edition-outline__wide-only" data-column="scenarios">
              {plan.scenarios.length === 0 ? (
                '—'
              ) : (
                <span className="edition-outline__chips">
                  {plan.scenarios.map((name, at) => (
                    <span key={`${at}-${name}`} className="edition-outline__chip">
                      {name}
                    </span>
                  ))}
                </span>
              )}
            </td>
            <td className="edition-outline__wide-only" data-column="resources">
              {plan.resources || '—'}
            </td>
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
 * "+ Add lesson plan": a new lesson plan in a drawer, already of this edition and in this module
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
        + Add lesson plan
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
