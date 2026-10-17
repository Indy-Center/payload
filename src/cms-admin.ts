import type { User } from '@/payload-types'

/**
 * The CMS admin, who may do everything in the CMS. Every area's own access check also lets this
 * role in, so a new area's check should too.
 */
export const CMS_ADMIN = 'cms:admin'

export const isCmsAdmin = (user: Pick<User, 'roles'> | null | undefined) =>
  Boolean(user?.roles?.includes(CMS_ADMIN))
