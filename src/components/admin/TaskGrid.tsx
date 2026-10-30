'use client'
import React, { useEffect, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, toast } from '@payloadcms/ui'
import type { GridTask } from '@/courseware/task-grid'
import {
  gridBatch,
  gridReducer,
  gridRows,
  initGrid,
  pendingCount,
  type GridRow,
} from './task-grid-state'
import { useEndpoint } from './useEndpoint'

const baseClass = 'task-grid'

type Refusals = { rows: Record<string, string[]>; batch: string[] }
const noRefusals: Refusals = { rows: {}, batch: [] }

/**
 * The Tasks list's "Edit as grid" tab, for the Training Admin and leads (0022): names and
 * descriptions edited in place, tasks added where they belong, moved among their siblings and
 * retired, all saved together by Save or dropped by Discard. Numbers come from the grid's own
 * copy of the tree, so they change as soon as a task is added or moved (0025).
 */
export function TaskGrid({
  tasks,
  showRetired: showRetiredAtFirst = false,
}: {
  tasks: GridTask[]
  /** Whether retired tasks show at first: the tree's own "Show retired". */
  showRetired?: boolean
}) {
  const call = useEndpoint()
  const router = useRouter()
  const [state, dispatch] = useReducer(gridReducer, tasks, initGrid)
  // The grid's own, so ticking it keeps the pending changes.
  const [showRetired, setShowRetired] = useState(showRetiredAtFirst)
  const [refusals, setRefusals] = useState<Refusals>(noRefusals)
  const [busy, setBusy] = useState(false)
  const table = useRef<HTMLTableElement>(null)

  const rows = gridRows(state, showRetired)
  const pending = pendingCount(state)

  // A new row takes the cursor in its name cell.
  useEffect(() => {
    if (!state.focus) return
    table.current
      ?.querySelector<HTMLInputElement>(`tr[data-row="${state.focus}"] input[name="name"]`)
      ?.focus()
    dispatch({ type: 'focused' })
  }, [state.focus])

  const discard = () => {
    dispatch({ type: 'reset', tasks })
    setRefusals(noRefusals)
  }

  const save = async () => {
    setBusy(true)
    // Once saved, the grid stays busy until the tasks read again arrive and start it afresh
    // (its key changes), so a second press can't send the same batch again.
    const outcome = await call('/courseware/task-grid', 'post', gridBatch(state))
    if (outcome.ok) {
      setRefusals(noRefusals)
      toast.success(`${pending} ${pending === 1 ? 'change' : 'changes'} saved.`)
      // The tree, and every number shown elsewhere, are read again from what was saved.
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
    <div className={baseClass}>
      <div className={`${baseClass}__controls`}>
        <label className="task-tree-list__retired">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(event) => setShowRetired(event.target.checked)}
          />
          Show retired
        </label>
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
      {refusals.batch.map((message) => (
        <p key={message} className={`${baseClass}__error`} role="alert">
          {message}
        </p>
      ))}
      <div className={`${baseClass}__scroll`}>
        <table className={`${baseClass}__table`} ref={table}>
          <thead>
            <tr>
              <th className={`${baseClass}__number`}>Number</th>
              <th>Name</th>
              <th>Description</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.kind === 'placeholder' ? (
                <Placeholder key={`+${row.parent ?? ''}`} row={row} dispatch={dispatch} />
              ) : (
                <TaskRow
                  key={row.id}
                  row={row}
                  refusals={refusals.rows[row.id] ?? []}
                  dispatch={dispatch}
                />
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className={`${baseClass}__note`}>
        New rows are highlighted and numbered where they will land. Retired rows are struck through
        until you save. Nothing is written until Save, and then all of it or none.
      </p>
    </div>
  )
}

type Dispatch = React.Dispatch<Parameters<typeof gridReducer>[1]>
// A child sits one step further in than its parent, in the number column and the name column alike.
const indent = (depth: number, base = 0.75) => ({
  paddingInlineStart: `${base + depth * 1.25}rem`,
})
const cellPadding = 0.5

function Placeholder({
  row,
  dispatch,
}: {
  row: Extract<GridRow, { kind: 'placeholder' }>
  dispatch: Dispatch
}) {
  return (
    <tr className={`${baseClass}__placeholder`}>
      <td className={`${baseClass}__number`} style={indent(row.depth)}>
        <span className={`${baseClass}__arrows`} aria-hidden="true" />
        <span data-number>{row.number}</span>
      </td>
      <td colSpan={3} style={indent(row.depth, cellPadding)}>
        <button
          type="button"
          className={`${baseClass}__new`}
          aria-label={`New task ${row.number}`}
          onClick={() => dispatch({ type: 'add', parent: row.parent })}
        >
          + New task
        </button>
      </td>
    </tr>
  )
}

function TaskRow({
  row,
  refusals,
  dispatch,
}: {
  row: Extract<GridRow, { kind: 'task' }>
  refusals: string[]
  dispatch: Dispatch
}) {
  const retiring = row.retire === true
  const retired = retiring || (row.retired && row.retire !== false)
  const locked = row.locked !== null
  const classes = [
    `${baseClass}__row`,
    row.isNew && `${baseClass}__row--new`,
    retiring && `${baseClass}__row--retiring`,
    row.retired && row.retire === undefined && `${baseClass}__row--retired`,
    refusals.length > 0 && `${baseClass}__row--refused`,
  ]
  const cell = (changed: boolean) =>
    `${baseClass}__cell${changed || row.isNew ? ` ${baseClass}__cell--changed` : ''}`

  return (
    <tr data-row={row.id} className={classes.filter(Boolean).join(' ')}>
      <td
        className={`${baseClass}__number${row.changed.place ? ` ${baseClass}__number--moved` : ''}`}
        style={indent(row.depth)}
      >
        <span className={`${baseClass}__arrows`}>
          <button
            type="button"
            className={`${baseClass}__arrow`}
            aria-label={`Move ${row.number} up`}
            disabled={!row.up || locked}
            onClick={() => row.up && dispatch({ type: 'swap', id: row.id, with: row.up })}
          >
            ↑
          </button>
          <button
            type="button"
            className={`${baseClass}__arrow`}
            aria-label={`Move ${row.number} down`}
            disabled={!row.down || locked}
            onClick={() => row.down && dispatch({ type: 'swap', id: row.id, with: row.down })}
          >
            ↓
          </button>
        </span>
        <span data-number>{row.number}</span>
      </td>
      <td className={`${baseClass}__name`} style={indent(row.depth, cellPadding)}>
        <input
          name="name"
          aria-label={`Name of ${row.number}`}
          className={cell(row.changed.name)}
          value={row.name}
          placeholder="Name"
          disabled={retired || locked}
          onChange={(event) =>
            dispatch({ type: 'edit', id: row.id, field: 'name', value: event.target.value })
          }
        />
        {row.retired && row.retire === undefined ? (
          <span className="task-tree__retired">Retired</span>
        ) : null}
        {[row.locked, row.warning]
          .filter((note): note is string => note !== null && !refusals.includes(note))
          .map((note) => (
            <div key={note} className={`${baseClass}__hint`}>
              {note}
            </div>
          ))}
        {refusals.map((message) => (
          <div key={message} className={`${baseClass}__error`}>
            {message}
          </div>
        ))}
      </td>
      <td className={`${baseClass}__description`}>
        <textarea
          name="description"
          rows={1}
          aria-label={`Description of ${row.number}`}
          className={cell(row.changed.description)}
          value={row.description}
          disabled={retired || locked}
          onChange={(event) =>
            dispatch({ type: 'edit', id: row.id, field: 'description', value: event.target.value })
          }
        />
      </td>
      <td className={`${baseClass}__actions`}>
        {locked ? null : <RowActions row={row} dispatch={dispatch} />}
      </td>
    </tr>
  )
}

/** "+ Below", "+ Child", and Retire, Keep, Un-retire, Keep retired or Remove. */
function RowActions({
  row,
  dispatch,
}: {
  row: Extract<GridRow, { kind: 'task' }>
  dispatch: Dispatch
}) {
  const small = { buttonStyle: 'secondary', size: 'xsmall', margin: false } as const
  return (
    <>
      <Button
        {...small}
        aria-label={`Add a task below ${row.number}`}
        onClick={() => dispatch({ type: 'add', parent: row.parent, after: row.id })}
      >
        + Below
      </Button>
      {row.canAddChild ? (
        <Button
          {...small}
          aria-label={`Add a first task under ${row.number}`}
          onClick={() => dispatch({ type: 'add', parent: row.id })}
        >
          + Child
        </Button>
      ) : null}
      {row.isNew ? (
        <Button
          {...small}
          aria-label={`Remove ${row.number}`}
          onClick={() => dispatch({ type: 'remove', key: row.id })}
        >
          Remove
        </Button>
      ) : (
        <Button
          {...small}
          aria-label={`${retireLabel(row)} ${row.number}`}
          onClick={() => dispatch({ type: 'retire', id: row.id })}
        >
          {retireLabel(row)}
        </Button>
      )}
    </>
  )
}

/** Retire, or undo it with Keep; a retired task's Un-retire, undone with Keep retired. */
function retireLabel(row: Extract<GridRow, { kind: 'task' }>) {
  if (row.retire === true) return 'Keep'
  if (row.retire === false) return 'Keep retired'
  return row.retired ? 'Un-retire' : 'Retire'
}
