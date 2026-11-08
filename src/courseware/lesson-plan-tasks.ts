/**
 * A save's `context` flag: its rows are exactly the lesson plan's tasks, so a row for a parent
 * task adds no rows for the tasks beneath it. The lesson plan's grid saves this way, since its
 * picker has already offered them.
 */
export const ROWS_AS_SENT = 'lessonPlanRowsAsSent'
