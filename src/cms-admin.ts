import type { User } from '@/payload-types'

/** The CMS admin, who may do everything in the CMS. */
export const CMS_ADMIN = 'cms:admin'

type Role = NonNullable<User['roles']>[number]
export type RoleHolder = Pick<User, 'roles'> | null | undefined

/** These roles and the CMS admin: everyone who may act as any of them. */
export const rolesActingAs = (...roles: Role[]): Role[] => [CMS_ADMIN, ...roles]

/**
 * Whether this user holds any of these roles, or is the CMS admin. An area's access check names
 * only its own roles through this, so the CMS admin is let in without the area naming it.
 */
export const mayActAs = (user: RoleHolder, ...roles: Role[]) => {
  const allowed = rolesActingAs(...roles)
  return Boolean(user?.roles?.some((role) => allowed.includes(role)))
}
