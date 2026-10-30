import React from 'react'
import type { TextFieldServerProps } from 'payload'
import { idOf } from '@/courseware/ids'
import { mayChangeOutline, STRUCTURAL_CHANGES_BY_A_LEAD } from '@/courseware/outline'
import { ModuleSelect } from './ModuleSelect'

/**
 * A lesson plan's Module: its edition's modules, with the one it sits in chosen. Choosing another
 * moves it to the end of that module when the plan is saved (the `module` field's afterChange).
 * Greyed out for whoever the edition's own rules keep from changing its outline: a course author
 * in a published edition (0055).
 */
export async function LessonPlanModule({ data, id, path, req }: TextFieldServerProps) {
  const editionId = idOf(data?.courseVersion as string | { id: string } | null | undefined)
  if (!editionId) return null
  const edition = await req.payload.findByID({
    collection: 'course-versions',
    id: editionId,
    depth: 0,
    disableErrors: true,
    req,
    user: req.user,
    overrideAccess: false,
  })
  if (!edition) return null

  const modules = (edition.modules ?? []).map((module) => ({
    id: module.id!,
    title: module.title,
  }))
  const holding = (edition.modules ?? []).find((module) =>
    (module.lessonPlans ?? []).some((plan) => idOf(plan) === id),
  )
  // A new plan's module comes from the form: "Add lesson plan" on a module sets it.
  const current = id ? (holding?.id ?? '') : ((data?.module as string | undefined) ?? '')
  const may = await mayChangeOutline(req, editionId)

  return (
    <ModuleSelect
      path={path}
      modules={modules}
      current={current}
      disabled={!may}
      note={!may && edition.status === 'published' ? STRUCTURAL_CHANGES_BY_A_LEAD : null}
    />
  )
}
