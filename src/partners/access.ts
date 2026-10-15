import type { Access, CollectionConfig } from 'payload'
import type { User } from '@/payload-types'

/**
 * Who may do what with partners (community-website decision 0001). People with `partners:editor`
 * do everything; nobody else may read or write partners through the API. The community site reads
 * them through `GET /api/partners` alone, so the CMS decides what reaches it and drafts never leak.
 */
export const PARTNERS_EDITOR = 'partners:editor'

type Person = Pick<User, 'roles'> | null | undefined

export const isPartnersEditor = (user: Person) => Boolean(user?.roles?.includes(PARTNERS_EDITOR))

const editorsOnly: Access = ({ req }) => isPartnersEditor(req.user as Person)

export const partnersAccess: CollectionConfig['access'] = {
  read: editorsOnly,
  create: editorsOnly,
  update: editorsOnly,
  delete: editorsOnly,
}
