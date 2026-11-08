import { docAccessOperation, ValidationError, type PayloadRequest } from 'payload'
import { idOf } from './ids'
import { refuseStaleSave } from '@/stale-save'
import {
  STALE_LESSON_PLAN,
  type GridPlanTask,
  type LessonPlanGridBatch,
  type PickerTask,
} from './lesson-plan-grid'
import { gradableStatements, ROWS_AS_SENT } from './lesson-plan-tasks'
import { mayChangeLessonPlanStructure } from './structure'
import { TaskGridRefused } from './task-grid-batch'
import type { TaskGridRefusal } from './task-grid'
import { loadTaskTree } from './task-tree'

/**
 * A lesson plan's "Edit as grid" tab, its server side: the rows and the picker's tasks it starts
 * from, and its Save, one save of the lesson plan as the signed-in person through the lesson
 * plan's own rules (0065; 0055 in a published edition), so all of it is written or none.
 */

export type LessonPlanGrid = {
  /** The lesson plan's `updatedAt` as read: Save sends it, and is refused if it has changed. */
  updatedAt: string
  rows: GridPlanTask[]
  /** The live tasks, in tree order, for "Add tasks". */
  picker: PickerTask[]
  /** Whether the person may save this lesson plan at all. */
  mayEdit: boolean
  /** Whether they may change its rows, their order, required and grades, or only teacher notes. */
  mayChangeStructure: boolean
}

export async function loadLessonPlanGrid(req: PayloadRequest, id: string): Promise<LessonPlanGrid> {
  const plan = await req.payload.findByID({
    collection: 'lesson-plans',
    id,
    depth: 0,
    req,
    user: req.user,
    overrideAccess: false,
  })
  const tree = await loadTaskTree(req)
  const rows = (plan.tasks ?? []).flatMap((row): GridPlanTask[] => {
    const taskId = idOf(row.task)
    const task = taskId ? tree.get(taskId) : undefined
    if (!taskId || !task || !row.id) return []
    const statements = gradableStatements(task)
    return [
      {
        id: row.id,
        task: taskId,
        number: tree.number(taskId),
        name: task.name,
        retired: task.retired,
        hasKnowledge: statements.knowledge,
        hasSkill: statements.skill,
        required: row.required !== false,
        gradesKnowledge: row.gradesKnowledge === true,
        gradesSkill: row.gradesSkill === true,
        teacherNotes: row.teacherNotes ?? '',
      },
    ]
  })
  const depth = (taskId: string) => tree.ancestors(taskId).length
  const picker = tree.inOrder
    .filter((task) => !task.retired)
    .map((task) => {
      const statements = gradableStatements(task)
      return {
        id: task.id,
        parentId: task.parentId,
        number: tree.number(task.id),
        name: task.name,
        depth: depth(task.id),
        hasKnowledge: statements.knowledge,
        hasSkill: statements.skill,
      }
    })
  const permissions = await docAccessOperation({
    collection: req.payload.collections['lesson-plans'],
    id,
    req,
  })
  return {
    updatedAt: plan.updatedAt,
    rows,
    picker,
    mayEdit: Boolean(permissions.update),
    mayChangeStructure: await mayChangeLessonPlanStructure(req, idOf(plan.courseVersion)),
  }
}

/** A refusal at `tasks.<index>.<field>` names the row sent at that index. */
const ROW_PATH = /^tasks\.(\d+)\./

/**
 * Saves the grid's rows, in their order, as the lesson plan's tasks. The rows are saved as sent: a
 * parent task added here gets no rows for the tasks beneath it, which the picker already offered.
 * A refusal names each refused row by its key; one about the whole list (a course author's
 * structural change in a published edition) names none.
 *
 * A batch sent with the `updatedAt` the grid loaded is refused whole, before any other rule, if
 * the lesson plan has been saved since (0068); one that lands answers the new `updatedAt`, which
 * the grid sends with its next Save. Must run in a transaction.
 */
export async function saveLessonPlanGrid(
  req: PayloadRequest,
  id: string,
  batch: LessonPlanGridBatch,
): Promise<{ rows: number; updatedAt: string }> {
  if (batch?.updatedAt !== undefined) {
    // Read first as the person, so a lesson plan they can't see is refused as such, not as stale.
    await req.payload.findByID({
      collection: 'lesson-plans',
      id,
      depth: 0,
      req,
      overrideAccess: false,
    })
    await refuseStaleSave(
      req,
      { collection: 'lesson-plans', id },
      batch.updatedAt,
      STALE_LESSON_PLAN,
    )
  }
  const sent = Array.isArray(batch?.rows) ? batch.rows : []
  const tasks = sent.map((row) => ({
    ...(row.id ? { id: row.id } : {}),
    task: row.task,
    required: row.required !== false,
    gradesKnowledge: row.gradesKnowledge === true,
    gradesSkill: row.gradesSkill === true,
    teacherNotes: row.teacherNotes ?? '',
  }))
  let saved: { updatedAt: string }
  try {
    saved = await req.payload.update({
      collection: 'lesson-plans',
      id,
      data: { tasks },
      context: { [ROWS_AS_SENT]: true },
      depth: 0,
      req,
      user: req.user,
      overrideAccess: false,
    })
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error
    const refusals = error.data.errors.map(({ path, message }): TaskGridRefusal => {
      const index = ROW_PATH.exec(path ?? '')?.[1]
      const row = index === undefined ? undefined : sent[Number(index)]?.key
      return row ? { row, message } : { message }
    })
    throw new TaskGridRefused(refusals)
  } finally {
    // The Local API sets `context` on the shared request, so the flag would outlive this save.
    delete req.context[ROWS_AS_SENT]
  }
  return { rows: tasks.length, updatedAt: saved.updatedAt }
}
