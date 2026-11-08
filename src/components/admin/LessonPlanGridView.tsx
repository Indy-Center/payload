import React from 'react'
import type { DocumentViewServerProps } from 'payload'
import { Gutter, SetDocumentStepNav } from '@payloadcms/ui'
import { loadLessonPlanGrid } from '@/courseware/lesson-plan-grid-save'
import { STRUCTURAL_CHANGES_BY_A_LEAD } from '@/courseware/outline'
import type { GridPlanTask } from '@/courseware/lesson-plan-grid'
import { LessonPlanTaskGrid } from './LessonPlanTaskGrid'

/**
 * A lesson plan's "Edit as grid" tab: its tasks read here, on the server, for the person signed
 * in. `?add=true` opens it with "Add tasks" showing, as the lesson plan form's link does.
 */
export async function LessonPlanGridView({
  doc,
  initPageResult,
  searchParams,
}: DocumentViewServerProps) {
  const { req } = initPageResult
  const id = String((doc as { id: string }).id)
  const grid = await loadLessonPlanGrid(req, id)

  return (
    <Gutter>
      <SetDocumentStepNav
        collectionSlug="lesson-plans"
        id={id}
        pluralLabel="Lesson plans"
        useAsTitle="code"
        view="Edit as grid"
      />
      <LessonPlanTaskGrid
        key={`${grid.updatedAt} ${signature(grid.rows)}`}
        planId={id}
        updatedAt={grid.updatedAt}
        rows={grid.rows}
        picker={grid.picker}
        mayEdit={grid.mayEdit}
        mayChangeStructure={grid.mayChangeStructure}
        lockedNote={STRUCTURAL_CHANGES_BY_A_LEAD}
        pickerOpen={searchParams?.add === 'true'}
      />
    </Gutter>
  )
}

/**
 * Changes whenever what was saved does, so a saved grid starts afresh from the rows read again,
 * with the lesson plan's new `updatedAt` for its next Save.
 */
const signature = (rows: GridPlanTask[]) => JSON.stringify(rows)
