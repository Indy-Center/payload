import type { JobsConfig, TaskConfig } from 'payload'
import { maySyncPositions } from './access'
import { syncPositions } from './sync'

/** The queue the daily jobs run in. */
const DAILY = 'daily'

/**
 * The sync from vNAS, once a day at 09:00 UTC (early morning in Indiana, after US evening traffic),
 * on Payload's jobs queue. A failure is logged and the job marked failed; the next day tries again.
 */
export const syncPositionsTask: TaskConfig<{
  input: Record<string, never>
  output: { added: number; changed: number; retired: number }
}> = {
  slug: 'syncPositions',
  label: 'Sync positions from vNAS',
  outputSchema: [
    { name: 'added', type: 'number', required: true },
    { name: 'changed', type: 'number', required: true },
    { name: 'retired', type: 'number', required: true },
  ],
  schedule: [{ cron: '0 0 9 * * *', queue: DAILY }],
  handler: async ({ req }) => ({ output: await syncPositions(req) }),
}

/**
 * Payload's jobs queue. The app runs on one long-lived server, so it checks its daily queue every
 * few minutes itself. Tests never run it: they start a sync as the button does.
 *
 * Queueing, running and cancelling through the jobs API are for the CMS admin only, since the only
 * job is the sync.
 */
export const jobs: JobsConfig = {
  tasks: [syncPositionsTask],
  autoRun: [{ cron: '0 */5 * * * *', queue: DAILY }],
  shouldAutoRun: () => !process.env.VITEST,
  access: {
    queue: ({ req }) => maySyncPositions(req),
    run: ({ req }) => maySyncPositions(req),
    cancel: ({ req }) => maySyncPositions(req),
  },
}
