import type { Endpoint } from 'payload'
import { unauthorized } from '@/bearer-token'
import { maySyncPositions } from './access'
import { POSITIONS_SYNC_PATH } from './paths'
import { syncPositions } from './sync'
import { VnasUnusable } from './vnas'

export const positionsEndpoints: Endpoint[] = [
  {
    // The Positions list's "Sync from vNAS", for the CMS admin. Answers `{ added, changed,
    // retired }`, or `{ errors: [{ message }] }` when vNAS can't be used and nothing changed.
    path: POSITIONS_SYNC_PATH,
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      if (!maySyncPositions({ req }))
        return Response.json(
          { errors: [{ message: 'Only a CMS admin may sync positions from vNAS.' }] },
          { status: 403 },
        )
      try {
        return Response.json(await syncPositions(req))
      } catch (error) {
        // Either way the sync's transaction rolled back, and the sync logged it.
        const vnas = error instanceof VnasUnusable
        const message = vnas
          ? error.message
          : `The sync could not be saved: ${(error as Error).message}`
        return Response.json(
          { errors: [{ message: `${message} Nothing was changed.` }] },
          { status: vnas ? 502 : 500 },
        )
      }
    },
  },
]
