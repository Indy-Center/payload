import type { Access } from 'payload'
import { canAdministerTraining } from '@/courseware/access'
import type { User } from '@/payload-types'

/**
 * Who may do what with the content training-tools shows (training-app decision 0036): the Training
 * Admin and the CMS admin alone. training-tools reads it through `GET /api/training/*`, past access.
 */
export const trainingAdministratorsOnly: Access = ({ req }) =>
  canAdministerTraining(req.user as Pick<User, 'roles'> | null)
