import React from 'react'
import Link from 'next/link'
import type { DocumentViewServerProps } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { Gutter, SetDocumentStepNav } from '@payloadcms/ui'
import type { Course } from '@/payload-types'
import { EditionOutline } from './EditionOutline'
import { formatDate, loadEditions, loadOutline } from './editions'

/**
 * The course page's History tab (decision 0056): the editions the live one replaced, newest first.
 * Each opens read-only here; students who started on one finish it.
 */
export async function CourseHistoryView({
  doc,
  initPageResult,
  searchParams,
}: DocumentViewServerProps) {
  const { req } = initPageResult
  const course = doc as Course
  const { replaced } = await loadEditions(req, course)
  const historyURL = formatAdminURL({
    adminRoute: req.payload.config.routes.admin,
    path: `/collections/courses/${course.id}/history`,
  })
  const opened = replaced.find((edition) => edition.id === searchParams?.edition)
  const outline = opened ? await loadOutline(req, opened.id) : null

  return (
    <Gutter className="course-page">
      <SetDocumentStepNav
        collectionSlug="courses"
        id={course.id}
        pluralLabel="Courses"
        useAsTitle="code"
        view="History"
      />
      {opened && outline ? (
        <>
          <p>
            <Link href={historyURL}>← History</Link>
          </p>
          <div className="edition-banner edition-banner--replaced">
            <div className="edition-banner__text">
              <p className="edition-banner__name">
                <strong>Edition {opened.number}</strong>{' '}
                <span className="edition-tag">Replaced</span>
              </p>
              <p>Published {formatDate(opened.publishedAt)}. Read-only.</p>
            </div>
          </div>
          <EditionOutline edition={outline} editable={false} />
        </>
      ) : replaced.length === 0 ? (
        <p>No edition has been replaced yet. The live edition is on Content.</p>
      ) : (
        <>
          <div className="table edition-history">
            <table>
              <thead>
                <tr>
                  <th>Edition</th>
                  <th>Published</th>
                  <th>Lesson plans</th>
                </tr>
              </thead>
              <tbody>
                {replaced.map((edition) => (
                  <tr key={edition.id}>
                    <td>
                      <Link href={`${historyURL}?edition=${edition.id}`}>
                        Edition {edition.number}
                      </Link>
                    </td>
                    <td>{formatDate(edition.publishedAt)}</td>
                    <td>{edition.lessonPlans}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="edition-history__note">Students finish the edition they were assigned.</p>
        </>
      )}
    </Gutter>
  )
}
