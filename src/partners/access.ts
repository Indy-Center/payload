/**
 * Who may do what with partners (community-website decision 0001). People with `partners:editor`
 * and the CMS admin do everything; nobody else may read or write partners through the API. The
 * community site reads them through `GET /api/community/partners` alone, so the CMS decides what
 * reaches it and drafts never leak.
 */
import type { Access, CollectionConfig } from 'payload'
import { isCmsAdmin } from '@/cms-admin'
import type { User } from '@/payload-types'

export const PARTNERS_EDITOR = 'partners:editor'

type Person = Pick<User, 'roles'> | null | undefined

const editorsOnly: Access = ({ req }) => {
  const user = req.user as Person
  return isCmsAdmin(user) || Boolean(user?.roles?.includes(PARTNERS_EDITOR))
}

export const partnersAccess: CollectionConfig['access'] = {
  read: editorsOnly,
  create: editorsOnly,
  update: editorsOnly,
  delete: editorsOnly,
}
