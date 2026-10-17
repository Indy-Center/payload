/**
 * Who may do what with partners (community-website decision 0001). People with `partners:editor`
 * and the CMS admin do everything; nobody else may read or write partners through the API. The
 * community site reads them through `GET /api/community/partners` alone, so the CMS decides what
 * reaches it and drafts never leak.
 */
import type { Access, CollectionConfig } from 'payload'
import { mayActAs, type RoleHolder } from '@/cms-admin'

export const PARTNERS_EDITOR = 'partners:editor'

const editorsOnly: Access = ({ req }) => mayActAs(req.user as RoleHolder, PARTNERS_EDITOR)

export const partnersAccess: CollectionConfig['access'] = {
  read: editorsOnly,
  create: editorsOnly,
  update: editorsOnly,
  delete: editorsOnly,
}
