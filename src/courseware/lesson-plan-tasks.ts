import { ValidationError, type PayloadRequest } from 'payload'
import { idOf } from './ids'
import { loadTaskTree, type TreeTask } from './task-tree'

/** A lesson plan task as a save hands it over: a row being added is missing most of it. */
export type LessonPlanTaskRow = {
  id?: string | null
  task?: string | { id: string } | null
  required?: boolean | null
  gradesKnowledge?: boolean | null
  gradesSkill?: boolean | null
  teacherNotes?: string | null
}

/**
 * A save's `context` flag: its rows are exactly the lesson plan's tasks, so a row for a parent
 * task adds no rows for the tasks beneath it. The lesson plan's grid saves this way, since its
 * picker has already offered them.
 */
export const ROWS_AS_SENT = 'lessonPlanRowsAsSent'

const has = (statement: string) => statement.trim() !== ''

/** Which of its statements a task can be graded on: a row may grade only those (0065, 0066). */
export const gradableStatements = (
  task: Pick<TreeTask, 'knowledgeStatement' | 'skillStatement'>,
) => ({
  knowledge: has(task.knowledgeStatement),
  skill: has(task.skillStatement),
})

/**
 * A lesson plan's tasks as they are saved (decision 0065). A grade box a row leaves unset, as a
 * row just added does, starts ticked when its task has that statement. Then every row must grade
 * at least one statement, and only ones its task has; a row that breaks both rules is refused for
 * the first.
 */
export async function settleLessonPlanTasks<Row extends LessonPlanTaskRow>(
  req: PayloadRequest,
  rows: Row[] | null | undefined,
  path: string,
): Promise<Row[] | null | undefined> {
  if (!rows?.length) return rows
  const tree = await loadTaskTree(req)

  const settled = rows.map((row) => {
    const task = tree.get(idOf(row.task) ?? '')
    if (!task) return row
    const statements = gradableStatements(task)
    return {
      ...row,
      gradesKnowledge: row.gradesKnowledge ?? statements.knowledge,
      gradesSkill: row.gradesSkill ?? statements.skill,
    }
  })

  const errors = settled.flatMap((row, index) => {
    const id = idOf(row.task) ?? ''
    const task = tree.get(id)
    if (!task) return []
    const number = tree.number(id)
    const statements = gradableStatements(task)
    const at = (field: string, message: string) => [{ path: `${path}.${index}.${field}`, message }]
    if (row.gradesKnowledge && !statements.knowledge) {
      return at('gradesKnowledge', `Task ${number} has no knowledge statement to grade.`)
    }
    if (row.gradesSkill && !statements.skill) {
      return at('gradesSkill', `Task ${number} has no skill statement to grade.`)
    }
    if (!row.gradesKnowledge && !row.gradesSkill) {
      return at('gradesKnowledge', `Pick knowledge, skill or both to grade on task ${number}.`)
    }
    return []
  })
  if (errors.length > 0) throw new ValidationError({ errors })
  return settled
}
