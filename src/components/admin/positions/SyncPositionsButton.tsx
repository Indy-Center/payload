'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useAuth } from '@payloadcms/ui'
import { CMS_ADMIN } from '@/cms-admin'
import { useEndpoint } from '../useEndpoint'
import type { User } from '@/payload-types'
import { POSITIONS_SYNC_PATH } from '@/positions/paths'
import type { SyncReport } from '@/positions/sync'

/**
 * "Sync from vNAS" above the Positions list, for the CMS admin only: copies vNAS Data Admin now
 * rather than at the daily sync, and says how many positions were added, changed and retired.
 */
export function SyncPositionsButton() {
  const { user } = useAuth<User>()
  const call = useEndpoint()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null)

  if (!user?.roles?.includes(CMS_ADMIN)) return null

  const sync = async () => {
    setBusy(true)
    setMessage(null)
    const outcome = await call(POSITIONS_SYNC_PATH)
    if (outcome.ok) {
      const { added, changed, retired } = outcome.body as SyncReport
      setMessage({
        text: `Synced from vNAS: ${added} added, ${changed} changed, ${retired} retired.`,
        failed: false,
      })
      router.refresh()
    } else {
      const text =
        outcome.unreachable || outcome.errors.length
          ? outcome.messages[0]
          : 'The sync failed. Nothing was changed.'
      setMessage({ text, failed: true })
    }
    setBusy(false)
  }

  return (
    <div className="positions-sync">
      <Button buttonStyle="secondary" size="small" onClick={sync} disabled={busy} margin={false}>
        {busy ? 'Syncing…' : 'Sync from vNAS'}
      </Button>
      {message && (
        <p
          role={message.failed ? 'alert' : 'status'}
          className={`positions-sync__message${message.failed ? ' positions-sync__message--failed' : ''}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
