import React from 'react'
import type { DocumentViewServerProps } from 'payload'
import { Gutter, SetDocumentStepNav } from '@payloadcms/ui'
import type { Course } from '@/payload-types'
import { abilities } from './editions'
import { loadScenarioTab } from './scenarios'
import { ScenarioList } from './ScenarioList'

/**
 * The course page's Scenarios tab: the course's scenarios, grouped under the lesson plans that
 * offer them in the draft (else the live edition), then those offered by none, then the retired.
 * Each opens its form in a drawer, and "+ Add scenario" a new one of this course.
 */
export async function CourseScenariosView({ doc, initPageResult }: DocumentViewServerProps) {
  const { req } = initPageResult
  const course = doc as Course
  const tab = await loadScenarioTab(req, course)
  // Whoever may start an edition of the course may add its scenarios: staff and its authors.
  const mayAdd = abilities(req, course).start

  return (
    <Gutter className="course-page">
      <SetDocumentStepNav
        collectionSlug="courses"
        id={course.id}
        pluralLabel="Courses"
        useAsTitle="code"
        view="Scenarios"
      />
      <ScenarioList courseId={course.id} tab={tab} mayAdd={mayAdd} />
    </Gutter>
  )
}
