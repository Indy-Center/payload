import type { Access, CollectionConfig } from 'payload'

const signedIn: Access = ({ req }) => Boolean(req.user)

/**
 * Courseware is never deleted: a published course version may use any record, and a mistaken
 * click must not take it away. Tasks and scenarios are retired instead.
 */
export const coursewareAccess: CollectionConfig['access'] = {
  read: signedIn,
  create: signedIn,
  update: signedIn,
  delete: () => false,
}
