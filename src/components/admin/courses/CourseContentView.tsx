import React from 'react'
import Link from 'next/link'
import type { DocumentViewServerProps } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { Gutter, SetDocumentStepNav } from '@payloadcms/ui'
import { mayChangeOutline, STRUCTURAL_CHANGES_BY_A_LEAD } from '@/courseware/outline'
import type { Course } from '@/payload-types'
import { EditionActions } from './EditionActions'
import { EditionOutline } from './EditionOutline'
import { abilities, loadEditions, loadOutline } from './editions'

/**
 * The course page's Content tab (decision 0056): one edition at a time, picked from a switch, the
 * draft when there is one and otherwise the live edition. A banner names the edition in view, says
 * who sees changes to it, and carries what may be done to it.
 */
export async function CourseContentView({
  doc,
  initPageResult,
  searchParams,
}: DocumentViewServerProps) {
  const { req } = initPageResult
  const course = doc as Course
  const { live, draft } = await loadEditions(req, course)
  const may = abilities(req, course)
  const contentURL = formatAdminURL({
    adminRoute: req.payload.config.routes.admin,
    path: `/collections/courses/${course.id}/content`,
  })

  const asked = searchParams?.edition === 'live' ? 'live' : 'draft'
  const shown = (asked === 'live' ? (live ?? draft) : (draft ?? live)) ?? null
  const status = shown && shown === draft ? 'draft' : 'live'
  const outline = shown ? await loadOutline(req, shown.id) : null
  // The edition's own update rule says who may change its outline (0055).
  const rearrange = shown ? await mayChangeOutline(req, shown.id) : false

  return (
    <Gutter className="course-page">
      <SetDocumentStepNav
        collectionSlug="courses"
        id={course.id}
        pluralLabel="Courses"
        useAsTitle="code"
        view="Content"
      />
      {!shown || !outline ? (
        <div className="edition-banner">
          <div className="edition-banner__text">
            <p>{course.code} has no editions.</p>
          </div>
          <EditionActions
            courseId={course.id}
            contentURL={contentURL}
            edition={null}
            liveNumber={null}
            hasDraft={false}
            may={may}
          />
        </div>
      ) : (
        <>
          <nav className="edition-switch" aria-label="Edition">
            {[draft, live].map((edition) => {
              if (!edition) return null
              const which = edition === draft ? 'draft' : 'live'
              const current = edition === shown
              return (
                <Link
                  key={which}
                  href={`${contentURL}?edition=${which}`}
                  className={`edition-switch__option${current ? ' edition-switch__option--on' : ''}`}
                  aria-current={current ? 'page' : undefined}
                >
                  Edition {edition.number} · {which}
                </Link>
              )
            })}
          </nav>
          <div className={`edition-banner edition-banner--${status}`}>
            <div className="edition-banner__text">
              <p className="edition-banner__name">
                <strong>Edition {shown.number}</strong>{' '}
                <span className={`edition-tag edition-tag--${status}`}>
                  {status === 'draft' ? 'Draft' : 'Live'}
                </span>
              </p>
              <p>
                {status === 'draft'
                  ? 'Students don’t see this until it’s published.'
                  : `Changes here reach students on edition ${shown.number} straight away.`}
              </p>
            </div>
            <EditionActions
              courseId={course.id}
              contentURL={contentURL}
              edition={{
                id: shown.id,
                number: shown.number,
                status,
                ownLessonPlans: outline.ownLessonPlans,
              }}
              liveNumber={live?.number ?? null}
              hasDraft={Boolean(draft)}
              may={may}
            />
          </div>
          <EditionOutline
            edition={outline}
            editable
            rearrange={rearrange}
            structuralNote={status === 'live' ? STRUCTURAL_CHANGES_BY_A_LEAD : null}
          />
        </>
      )}
    </Gutter>
  )
}
