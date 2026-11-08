'use client'
import React, { useReducer, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, toast } from '@payloadcms/ui'
import type { GridPlanTask, PickerTask } from '@/courseware/lesson-plan-grid'
import {
  changedCells,
  gridBatch,
  gridReducer,
  initGrid,
  movedRows,
  pendingCount,
  presentTasks,
  type GridAction,
  type GridRow,
} from './lesson-plan-grid-state'
import { LeaveGuard } from './LeaveGuard'
import { LessonPlanTaskPicker } from './LessonPlanTaskPicker'
import { useEndpoint } from './useEndpoint'

// The Tasks grid's look: its table, cells, arrows and messages.
const baseClass = 'task-grid'

type Refusals = { rows: Record<string, string[]>; batch: string[] }
const noRefusals: Refusals = { rows: {}, batch: [] }

/**
 * A lesson plan's "Edit as grid" tab (0065): its tasks one per row, with Required, the grade boxes
 * and teacher notes edited in place, rows reordered, removed and added from "Add tasks", all saved
 * together by Save or dropped by Discard. In a published edition a course author may change only
 * teacher notes (0055); the rest is greyed out with `lockedNote`.
 */
export function LessonPlanTaskGrid({
  planId,
  updatedAt,
  rows: saved,
  picker,
  mayEdit,
  mayChangeStructure,
  lockedNote,
  pickerOpen: pickerOpenAtFirst = false,
}: {
  planId: string
  /**
   * The lesson plan's `updatedAt` as the rows were read. Save sends it, and is refused if someone
   * else has saved the lesson plan since (0068); the refusal shows above the rows, which keep
   * their pending changes.
   */
  updatedAt: string
  rows: GridPlanTask[]
  picker: PickerTask[]
  mayEdit: boolean
  mayChangeStructure: boolean
  lockedNote: string
  /** Opens with "Add tasks" showing, as the lesson plan's own "Add tasks" link asks. */
  pickerOpen?: boolean
}) {
  const call = useEndpoint()
  const router = useRouter()
  const [state, dispatch] = useReducer(gridReducer, saved, initGrid)
  const [refusals, setRefusals] = useState<Refusals>(noRefusals)
  const [busy, setBusy] = useState(false)
  // Saved, and waiting for the rows read again: nothing is left to lose.
  const [done, setDone] = useState(false)
  const mayStructure = mayEdit && mayChangeStructure
  const [picking, setPicking] = useState(pickerOpenAtFirst && mayStructure)

  const pending = pendingCount(state)
  const moved = movedRows(state)
  const kept = state.rows.filter((row) => !row.removed)

  const discard = () => {
    dispatch({ type: 'reset', saved })
    setRefusals(noRefusals)
  }

  const save = async () => {
    setBusy(true)
    // Once saved, the grid stays busy until the rows read again start it afresh (its key
    // changes), so a second press can't send the same batch again.
    const outcome = await call(
      `/courseware/lesson-plans/${planId}/tasks`,
      'post',
      gridBatch(state, updatedAt),
    )
    if (outcome.ok) {
      setDone(true)
      setRefusals(noRefusals)
      toast.success(`${pending} ${pending === 1 ? 'change' : 'changes'} saved.`)
      router.refresh()
      return
    }
    setBusy(false)
    if (outcome.unreachable) {
      setRefusals({ rows: {}, batch: ['The CMS could not be reached. Nothing was saved.'] })
      return
    }
    const next: Refusals = { rows: {}, batch: [] }
    for (const { row, message } of outcome.errors) {
      if (row) (next.rows[row] ??= []).push(message)
      else next.batch.push(message)
    }
    if (!Object.keys(next.rows).length && !next.batch.length) {
      next.batch.push('Something went wrong. Nothing was saved.')
    }
    setRefusals(next)
    toast.error('Nothing was saved. Each refused row says why.')
  }

  return (
    <div className={`${baseClass} lesson-plan-grid`}>
      <LeaveGuard unsaved={pending > 0 && !done} />
      {mayEdit ? (
        <div className={`${baseClass}__controls`}>
          {mayStructure ? (
            <Button
              buttonStyle="secondary"
              size="small"
              margin={false}
              disabled={picking || busy}
              onClick={() => setPicking(true)}
            >
              Add tasks
            </Button>
          ) : (
            <p className={`${baseClass}__hint`}>{lockedNote}</p>
          )}
          <div className={`${baseClass}__save`}>
            <Button
              buttonStyle="secondary"
              size="small"
              margin={false}
              disabled={!pending || busy}
              onClick={discard}
            >
              Discard
            </Button>
            <Button size="small" margin={false} disabled={!pending || busy} onClick={save}>
              {`Save ${pending} ${pending === 1 ? 'change' : 'changes'}`}
            </Button>
          </div>
        </div>
      ) : null}
      {picking ? (
        <LessonPlanTaskPicker
          tasks={picker}
          present={presentTasks(state)}
          onCancel={() => setPicking(false)}
          onAdd={(tasks) => {
            dispatch({ type: 'add', tasks })
            setPicking(false)
          }}
        />
      ) : null}
      {refusals.batch.map((message) => (
        <p key={message} className={`${baseClass}__error`} role="alert">
          {message}
        </p>
      ))}
      {state.rows.length ? (
        <div className={`${baseClass}__scroll`}>
          <table className={`${baseClass}__table`}>
            <thead>
              <tr>
                <th className={`${baseClass}__number`}>Order</th>
                <th>Task</th>
                <th>Required</th>
                <th>Grade knowledge</th>
                <th>Grade skill</th>
                <th>Teacher notes</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row, index) => (
                <Row
                  key={row.key}
                  row={row}
                  place={row.removed ? null : kept.indexOf(row) + 1}
                  first={index === 0}
                  last={index === state.rows.length - 1}
                  moved={moved.has(row.key)}
                  changed={changedCells(state, row)}
                  refusals={refusals.rows[row.key] ?? []}
                  mayEdit={mayEdit && !busy}
                  mayStructure={mayStructure && !busy}
                  dispatch={dispatch}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={`${baseClass}__note`}>This lesson plan has no tasks yet.</p>
      )}
      {mayEdit ? (
        <p className={`${baseClass}__note`}>
          New rows are highlighted. Removed rows are struck through until you save. Nothing is
          written until Save, and then all of it or none.
        </p>
      ) : null}
    </div>
  )
}

function Row({
  row,
  place,
  first,
  last,
  moved,
  changed,
  refusals,
  mayEdit,
  mayStructure,
  dispatch,
}: {
  row: GridRow
  /** Its place among the rows kept; none for a row being removed. */
  place: number | null
  first: boolean
  last: boolean
  moved: boolean
  changed: Set<string>
  refusals: string[]
  mayEdit: boolean
  mayStructure: boolean
  dispatch: React.Dispatch<GridAction>
}) {
  const label = `${row.number} ${row.name}`
  const classes = [
    `${baseClass}__row`,
    row.isNew && `${baseClass}__row--new`,
    row.removed && `${baseClass}__row--retiring`,
    refusals.length > 0 && `${baseClass}__row--refused`,
  ]
  const editable = mayStructure && !row.removed
  const box = (field: 'required' | 'gradesKnowledge' | 'gradesSkill', name: string, has = true) => (
    <td className={changed.has(field) ? `${baseClass}__cell--changed` : undefined}>
      <input
        type="checkbox"
        aria-label={`${name} on ${row.number}`}
        checked={row[field]}
        // A box for a statement the task lacks can't be ticked; one already ticked can be cleared.
        disabled={!editable || (!has && !row[field])}
        onChange={(event) =>
          dispatch({ type: 'set', key: row.key, field, value: event.target.checked })
        }
      />
    </td>
  )

  return (
    <tr data-row={row.key} className={classes.filter(Boolean).join(' ')}>
      <td className={`${baseClass}__number${moved ? ` ${baseClass}__number--moved` : ''}`}>
        {mayStructure ? (
          <span className={`${baseClass}__arrows`}>
            <button
              type="button"
              className={`${baseClass}__arrow`}
              aria-label={`Move ${row.number} up`}
              disabled={first}
              onClick={() => dispatch({ type: 'move', key: row.key, by: -1 })}
            >
              ↑
            </button>
            <button
              type="button"
              className={`${baseClass}__arrow`}
              aria-label={`Move ${row.number} down`}
              disabled={last}
              onClick={() => dispatch({ type: 'move', key: row.key, by: 1 })}
            >
              ↓
            </button>
          </span>
        ) : null}
        <span data-number>{place ?? '–'}</span>
      </td>
      <td className={`${baseClass}__name`}>
        <div className={`${baseClass}__task`} data-task>
          {label}
          {row.retired ? <span className="task-tree__retired">Retired</span> : null}
        </div>
        {refusals.map((message) => (
          <div key={message} className={`${baseClass}__error`}>
            {message}
          </div>
        ))}
      </td>
      {box('required', 'Required')}
      {box('gradesKnowledge', 'Grade knowledge', row.hasKnowledge)}
      {box('gradesSkill', 'Grade skill', row.hasSkill)}
      <td className={`${baseClass}__description`}>
        <textarea
          name="teacherNotes"
          rows={1}
          aria-label={`Teacher notes on ${row.number}`}
          className={`${baseClass}__cell${changed.has('teacherNotes') || row.isNew ? ` ${baseClass}__cell--changed` : ''}`}
          value={row.teacherNotes}
          disabled={!mayEdit || row.removed}
          onChange={(event) => dispatch({ type: 'notes', key: row.key, value: event.target.value })}
        />
      </td>
      <td className={`${baseClass}__actions`}>
        {mayStructure ? (
          <Button
            buttonStyle="secondary"
            size="xsmall"
            margin={false}
            aria-label={`${row.removed ? 'Keep' : 'Remove'} ${row.number}`}
            onClick={() => dispatch({ type: 'remove', key: row.key })}
          >
            {row.removed ? 'Keep' : 'Remove'}
          </Button>
        ) : null}
      </td>
    </tr>
  )
}
