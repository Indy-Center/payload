/** Which way a task moves among its siblings, or a lesson plan within its module: ↑ or ↓. */
export type MoveDirection = 'up' | 'down'

export const isMoveDirection = (value: unknown): value is MoveDirection =>
  value === 'up' || value === 'down'
