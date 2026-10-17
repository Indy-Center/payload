import type { CollectionConfig } from 'payload'
import { CMS_ADMIN } from '@/cms-admin'
import { ROLES, trainingAdminField, userAccess } from '@/courseware/access'
import { PARTNERS_EDITOR } from '@/partners/access'

/**
 * The CMS's own accounts. Until the CMS signs in through identity (DEV-219), `cid` and `roles`
 * stand in for what identity will say; only the Training Admin and the CMS admin set them. Course
 * authors are not given accounts until then (decisions 0036, 0037).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  access: userAccess,
  fields: [
    // Email added by default
    {
      name: 'cid',
      label: 'VATSIM CID',
      type: 'text',
      index: true,
      access: { create: trainingAdminField, update: trainingAdminField },
      admin: { className: 'cid', description: 'Matches course authors named on a course.' },
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: [CMS_ADMIN, ...ROLES, PARTNERS_EDITOR].map((role) => ({ label: role, value: role })),
      defaultValue: [],
      access: { create: trainingAdminField, update: trainingAdminField },
      admin: {
        description:
          'cms:admin may do everything; training:admin is the Training Admin; training:lead a lead instructor; partners:editor edits the community site’s partners.',
      },
    },
  ],
}
