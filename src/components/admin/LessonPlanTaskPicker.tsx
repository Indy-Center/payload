'use client'
import React, { useState } from 'react'
import { Button } from '@payloadcms/ui'
import { tasksToAdd, toggleTicked, type PickerTask } from '@/courseware/lesson-plan-grid'

const baseClass = 'lesson-plan-picker'

/**
 * "Add tasks": the live task tree, each task with a box. Ticking a task ticks every task beneath
 * it; unticking one leaves the rest. Tasks already on the lesson plan show as added and can't be
 * ticked. "Add" hands over the ticked tasks in tree order.
 */
export function LessonPlanTaskPicker({
  tasks,
  present,
  onAdd,
  onCancel,
}: {
  tasks: readonly PickerTask[]
  present: ReadonlySet<string>
  onAdd: (tasks: PickerTask[]) => void
  onCancel: () => void
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const chosen = tasksToAdd(tasks, ticked, present)

  return (
    <section className={baseClass} aria-label="Add tasks">
      <ul className={`${baseClass}__list`}>
        {tasks.map((task) => {
          const added = present.has(task.id)
          return (
            <li key={task.id} style={{ paddingInlineStart: `${task.depth * 1.25}rem` }}>
              <label className={`${baseClass}__task${added ? ` ${baseClass}__task--added` : ''}`}>
                <input
                  type="checkbox"
                  aria-label={`${task.number} ${task.name}`}
                  checked={added || ticked.has(task.id)}
                  disabled={added}
                  onChange={() => setTicked(toggleTicked(tasks, ticked, present, task.id))}
                />
                <span className={`${baseClass}__number`}>{task.number}</span> {task.name}
                {added ? <span className={`${baseClass}__added`}>Already added</span> : null}
              </label>
            </li>
          )
        })}
      </ul>
      <div className={`${baseClass}__buttons`}>
        <Button buttonStyle="secondary" size="small" margin={false} onClick={onCancel}>
          Cancel
        </Button>
        <Button size="small" margin={false} disabled={!chosen.length} onClick={() => onAdd(chosen)}>
          {`Add ${chosen.length} ${chosen.length === 1 ? 'task' : 'tasks'}`}
        </Button>
      </div>
    </section>
  )
}
