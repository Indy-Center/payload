'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, useStepNav } from '@payloadcms/ui'
import type { ImportReport, Tally } from '@/courseware/import/import-frameworks'
import {
  ALL_SHEET_FILES,
  EDITION_FIELDS,
  IMPORT_ENDPOINTS,
  type SheetFile,
} from '@/courseware/import/form'
import { useEndpoint } from './useEndpoint'

const baseClass = 'framework-import'

/** What each file is, as the sheet's tabs are named. */
const TABS: Record<SheetFile, string> = {
  'usa-framework.csv': 'The USA framework tab',
  'gcap-codes.csv': 'The GCAP codes tab',
  'rubric-s1.csv': 'The S1 rating exam rubric',
  'rubric-s2.csv': 'The S2 rating exam rubric',
  'rubric-s3.csv': 'The S3 rating exam rubric',
  'rubric-c1.csv': 'The C1 rating exam rubric',
}

type Outcome = {
  dryRun: boolean
  editions: { usa: string; gcap: string }
  report: ImportReport
}

/** Competencies › Import framework edition. */
export function ImportStepNav({ competenciesURL }: { competenciesURL: string }) {
  const { setStepNav } = useStepNav()
  useEffect(
    () => setStepNav([{ label: 'Competencies', url: competenciesURL }, { label: 'Import' }]),
    [setStepNav, competenciesURL],
  )
  return null
}

/**
 * The upload form: the six files and the two edition names. "Check" reports what an import would
 * do and writes nothing; "Import" is offered once a check of the same form has passed, and writes
 * it. The files go to the CMS with each request and are not kept.
 */
export function ImportFrameworksForm({ competenciesURL }: { competenciesURL: string }) {
  const call = useEndpoint()
  const [files, setFiles] = useState<Partial<Record<SheetFile, File>>>({})
  const [editions, setEditions] = useState({ usa: '', gcap: '' })
  const [busy, setBusy] = useState<'check' | 'import' | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  // Any change to the form makes the last report stale, and Import waits for a fresh check.
  const changed = () => {
    setOutcome(null)
    setErrors([])
  }

  const send = async (which: 'check' | 'import') => {
    const form = new FormData()
    for (const name of ALL_SHEET_FILES) {
      const file = files[name]
      if (file) form.append(name, file)
    }
    form.append(EDITION_FIELDS.usa, editions.usa)
    form.append(EDITION_FIELDS.gcap, editions.gcap)

    setBusy(which)
    setErrors([])
    const answer = await call(IMPORT_ENDPOINTS[which], 'post', form)
    if (answer.ok) setOutcome(answer.body as Outcome)
    else {
      if (!answer.unreachable) setOutcome(null)
      setErrors(answer.messages)
    }
    setBusy(null)
  }

  const checked = outcome?.dryRun === true

  return (
    <div className={`${baseClass}__body`}>
      <p className={`${baseClass}__intro`}>
        Save each tab of VATUSA’s competency sheet as CSV, choose the files, and name the editions.
        Check shows what an import would create and change; nothing is written until you import. The
        files are read and not kept.
      </p>

      <fieldset className={`${baseClass}__group`}>
        <legend>Sheet tabs</legend>
        {ALL_SHEET_FILES.map((name) => (
          <label key={name} className={`${baseClass}__file`}>
            <span className={`${baseClass}__label`}>
              <code>{name}</code>
              <span className={`${baseClass}__hint`}>{TABS[name]}</span>
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              name={name}
              onChange={(event) => {
                const file = event.target.files?.[0]
                setFiles((previous) => ({ ...previous, [name]: file }))
                changed()
              }}
            />
          </label>
        ))}
      </fieldset>

      <fieldset className={`${baseClass}__group`}>
        <legend>Editions</legend>
        {(['usa', 'gcap'] as const).map((which) => (
          <label key={which} className={`${baseClass}__edition`}>
            <span className={`${baseClass}__label`}>
              {which === 'usa' ? 'USA edition' : 'GCAP edition'}
              <span className={`${baseClass}__hint`}>
                Such as 2027-04. An edition already in is updated to match the sheet.
              </span>
            </span>
            <input
              type="text"
              name={EDITION_FIELDS[which]}
              value={editions[which]}
              onChange={(event) => {
                setEditions((previous) => ({ ...previous, [which]: event.target.value }))
                changed()
              }}
            />
          </label>
        ))}
      </fieldset>

      <div className={`${baseClass}__actions`}>
        <Button
          buttonStyle="secondary"
          margin={false}
          disabled={busy !== null}
          onClick={() => send('check')}
        >
          {busy === 'check' ? 'Checking…' : 'Check'}
        </Button>
        <Button
          buttonStyle="primary"
          margin={false}
          disabled={busy !== null || !checked}
          onClick={() => send('import')}
        >
          {busy === 'import' ? 'Importing…' : 'Import'}
        </Button>
        {!checked && (
          <span className={`${baseClass}__hint`}>Import is offered once a check has passed.</span>
        )}
      </div>

      {errors.length > 0 && (
        <div className={`${baseClass}__errors`} role="alert">
          <p>Nothing was written:</p>
          <ul>
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {outcome && <ImportReportView outcome={outcome} competenciesURL={competenciesURL} />}
    </div>
  )
}

function ImportReportView({
  outcome,
  competenciesURL,
}: {
  outcome: Outcome
  competenciesURL: string
}) {
  const { dryRun, editions, report } = outcome
  return (
    <section
      className={`${baseClass}__report ${baseClass}__report--${dryRun ? 'check' : 'done'}`}
      aria-live="polite"
    >
      <h2>{dryRun ? 'Check: nothing written yet' : 'Imported'}</h2>
      <TallyView name={`USA ${editions.usa}`} tally={report.usa} dryRun={dryRun} />
      <TallyView name={`GCAP ${editions.gcap}`} tally={report.gcap} dryRun={dryRun} />
      {report.notes.length > 0 && (
        <div className={`${baseClass}__notes`}>
          <h3>Notes from the sheet reader</h3>
          <ul>
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
      {!dryRun && (
        <p>
          <Link href={competenciesURL}>See them on Competencies</Link>
        </p>
      )}
    </section>
  )
}

function TallyView({ name, tally, dryRun }: { name: string; tally: Tally; dryRun: boolean }) {
  const verb = (would: string, did: string) => (dryRun ? would : did)
  return (
    <div className={`${baseClass}__tally`}>
      <h3>{name}</h3>
      <p>
        {tally.created.length} {verb('to create', 'created')}, {tally.changed.length}{' '}
        {verb('to change', 'changed')}, {tally.unchanged} left alone
      </p>
      {tally.created.length > 0 && (
        <p className={`${baseClass}__ids`}>
          <span>{verb('Would create', 'Created')}:</span> {tally.created.join(', ')}
        </p>
      )}
      {tally.changed.length > 0 && (
        <p className={`${baseClass}__ids`}>
          <span>{verb('Would change', 'Changed')}:</span> {tally.changed.join(', ')}
        </p>
      )}
    </div>
  )
}
