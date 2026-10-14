import type { BaseFilter } from 'payload'

/**
 * Lists leave retired records out unless the list is being filtered on `retired`: filtering on it
 * is how someone asks to see them.
 */
export const hideRetiredUnlessAsked: BaseFilter = ({ req }) =>
  JSON.stringify(req.query?.where ?? {}).includes('retired')
    ? null
    : { retired: { not_equals: true } }
