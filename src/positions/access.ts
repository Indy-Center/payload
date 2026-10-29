import type { PayloadRequest } from 'payload'
import { mayActAs, type RoleHolder } from '@/cms-admin'

/** Only the CMS admin starts a sync from vNAS, from the Positions list or the jobs queue's API. */
export const maySyncPositions = (req: Pick<PayloadRequest, 'user'>) =>
  mayActAs(req.user as RoleHolder)
