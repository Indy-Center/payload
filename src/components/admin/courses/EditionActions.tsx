'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Modal, toast, useConfig, useModal } from '@payloadcms/ui'

type Props = {
  courseId: string
  /** The Content tab's own address, to switch edition after an action. */
  contentURL: string
  /** The edition in view, or null when the course has none. */
  edition: { id: string; number: number; status: 'draft' | 'live'; ownLessonPlans: number } | null
  /** The live edition's number, if there is one. */
  liveNumber: number | null
  hasDraft: boolean
  may: { start: boolean; publish: boolean; discard: boolean }
}

type Outcome = { ok: true; body: Record<string, unknown> } | { ok: false; messages: string[] }

/** Calls one of the course page's endpoints as the signed-in person. */
function useEndpoint() {
  const { config } = useConfig()
  return async (path: string, method: 'get' | 'post' = 'post'): Promise<Outcome> => {
    try {
      const response = await fetch(`${config.serverURL}${config.routes.api}${path}`, {
        method: method.toUpperCase(),
        credentials: 'include',
      })
      const body = await response.json().catch(() => ({}))
      if (response.ok) return { ok: true, body }
      const messages = (body.errors ?? []).map((error: { message: string }) => error.message)
      return { ok: false, messages: messages.length ? messages : ['Something went wrong.'] }
    } catch {
      return { ok: false, messages: ['The CMS could not be reached. Try again.'] }
    }
  }
}

/**
 * The buttons on an edition's banner: Start a new edition (or the first), Publish, and Discard
 * draft, each shown only to who may use it. Publish and Discard ask first, in a modal.
 */
export function EditionActions({
  courseId,
  contentURL,
  edition,
  liveNumber,
  hasDraft,
  may,
}: Props) {
  const router = useRouter()
  const call = useEndpoint()
  const [busy, setBusy] = useState(false)

  const go = (to: 'draft' | 'live' | null, message: string) => {
    toast.success(message)
    router.push(to ? `${contentURL}?edition=${to}` : contentURL)
    router.refresh()
  }

  const start = async () => {
    setBusy(true)
    const outcome = await call(`/courseware/courses/${courseId}/editions`)
    setBusy(false)
    if (!outcome.ok) return outcome.messages.forEach((message) => toast.error(message))
    const { number } = (outcome.body as { edition: { number: number } }).edition
    go(
      'draft',
      liveNumber
        ? `Edition ${number} started as a draft, copied from edition ${liveNumber} with its lesson plans.`
        : `Edition ${number} started as an empty draft.`,
    )
  }

  if (!edition || (edition.status === 'live' && !hasDraft)) {
    if (!may.start) return null
    return (
      <div className="edition-actions">
        <Button buttonStyle="secondary" margin={false} size="small" disabled={busy} onClick={start}>
          {edition ? 'Start a new edition' : 'Start the first edition'}
        </Button>
      </div>
    )
  }
  if (edition.status !== 'draft' || (!may.publish && !may.discard)) return null

  return (
    <div className="edition-actions">
      {may.publish && (
        <PublishButton
          edition={edition}
          liveNumber={liveNumber}
          call={call}
          onDone={() => go('live', `Edition ${edition.number} is live.`)}
        />
      )}
      {may.discard && (
        <DiscardButton
          edition={edition}
          call={call}
          onDone={() => go(null, `The draft, edition ${edition.number}, was discarded.`)}
        />
      )}
    </div>
  )
}

type Edition = NonNullable<Props['edition']>
type Call = ReturnType<typeof useEndpoint>

/** A modal laid out as Payload's own confirmation modal, with the buttons the caller gives. */
function AskFirst({
  slug,
  heading,
  children,
  actions,
}: {
  slug: string
  heading: string
  children: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    // Above the page as Payload's confirmation modal sits (its drawers start at z-index 100).
    <Modal
      slug={slug}
      className="confirmation-modal edition-modal"
      closeOnBlur={false}
      style={{ zIndex: 100 }}
    >
      <div className="confirmation-modal__wrapper">
        <div className="confirmation-modal__content">
          <h1>{heading}</h1>
          {children}
        </div>
        <div className="confirmation-modal__controls">{actions}</div>
      </div>
    </Modal>
  )
}

function PublishButton({
  edition,
  liveNumber,
  call,
  onDone,
}: {
  edition: Edition
  liveNumber: number | null
  call: Call
  onDone: () => void
}) {
  const slug = `publish-edition-${edition.id}`
  const { openModal, closeModal } = useModal()
  // null while the check runs; the reasons it can't be published, or none.
  const [faults, setFaults] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  const open = async () => {
    setFaults(null)
    openModal(slug)
    const outcome = await call(`/courseware/course-versions/${edition.id}/publishing-check`, 'get')
    setFaults(outcome.ok ? (outcome.body as { faults: string[] }).faults : outcome.messages)
  }

  const publish = async () => {
    setBusy(true)
    const outcome = await call(`/courseware/course-versions/${edition.id}/publish`)
    setBusy(false)
    if (!outcome.ok) return setFaults(outcome.messages)
    closeModal(slug)
    onDone()
  }

  const cancel = (
    <Button buttonStyle="secondary" size="large" disabled={busy} onClick={() => closeModal(slug)}>
      Cancel
    </Button>
  )

  return (
    <>
      <Button margin={false} size="small" onClick={open}>
        Publish edition {edition.number}
      </Button>
      <AskFirst
        slug={slug}
        heading={`Publish edition ${edition.number}?`}
        actions={
          faults && faults.length === 0 ? (
            <>
              {cancel}
              <Button size="large" disabled={busy} onClick={publish}>
                {busy ? 'Publishing…' : 'Publish'}
              </Button>
            </>
          ) : (
            cancel
          )
        }
      >
        {faults === null ? (
          <p>Checking the edition…</p>
        ) : faults.length === 0 ? (
          <p>
            Edition {edition.number} becomes live. New students start on it
            {liveNumber ? `; students on edition ${liveNumber} finish there` : ''}. Its grading
            scale is then fixed.
          </p>
        ) : (
          <>
            <p>Edition {edition.number} can’t be published yet:</p>
            <ul className="edition-modal__faults">
              {faults.map((fault) => (
                <li key={fault}>{fault}</li>
              ))}
            </ul>
          </>
        )}
      </AskFirst>
    </>
  )
}

function DiscardButton({
  edition,
  call,
  onDone,
}: {
  edition: Edition
  call: Call
  onDone: () => void
}) {
  const slug = `discard-edition-${edition.id}`
  const { openModal, closeModal } = useModal()
  const [refused, setRefused] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const plans = edition.ownLessonPlans

  const discard = async () => {
    setBusy(true)
    const outcome = await call(`/courseware/course-versions/${edition.id}/discard`)
    setBusy(false)
    if (!outcome.ok) return setRefused(outcome.messages)
    closeModal(slug)
    onDone()
  }

  return (
    <>
      <Button
        buttonStyle="secondary"
        margin={false}
        size="small"
        onClick={() => {
          setRefused([])
          openModal(slug)
        }}
      >
        Discard draft
      </Button>
      <AskFirst
        slug={slug}
        heading={`Discard edition ${edition.number}?`}
        actions={
          <>
            <Button
              buttonStyle="secondary"
              size="large"
              disabled={busy}
              onClick={() => closeModal(slug)}
            >
              Cancel
            </Button>
            <Button size="large" disabled={busy} onClick={discard}>
              {busy ? 'Discarding…' : 'Discard'}
            </Button>
          </>
        }
      >
        <p>
          The draft, edition {edition.number}, is deleted
          {plans === 0 ? '' : `, with its own ${plans} lesson ${plans === 1 ? 'plan' : 'plans'}`}.
          This can’t be undone.
        </p>
        {refused.length > 0 && (
          <ul className="edition-modal__faults">
            {refused.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </AskFirst>
    </>
  )
}
