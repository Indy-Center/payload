import React from 'react'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { canAdministerTraining } from '@/courseware/access'
import { IMPORT_FRAMEWORKS_PATH } from '@/courseware/import/form'
import type { User } from '@/payload-types'
import { ImportFrameworksForm, ImportStepNav } from './ImportFrameworksForm'

/**
 * The import page, opened from the Competencies list: the Training Admin uploads VATUSA's sheet,
 * checks what an import would do, then imports it. Anyone else is refused here, and again by the
 * endpoints the form posts to. A custom admin view has no template or sign-in check of its own,
 * so it adds both.
 */
export function ImportFrameworksView({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  const { routes, admin } = req.payload.config
  if (!req.user) {
    const back = formatAdminURL({ adminRoute: routes.admin, path: IMPORT_FRAMEWORKS_PATH })
    redirect(
      formatAdminURL({
        adminRoute: routes.admin,
        path: `${admin.routes.login}?redirect=${encodeURIComponent(back)}`,
      }),
    )
  }
  const competenciesURL = formatAdminURL({
    adminRoute: routes.admin,
    path: '/collections/competencies',
  })

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={req.user}
      visibleEntities={visibleEntities}
    >
      <Gutter className="framework-import">
        <ImportStepNav competenciesURL={competenciesURL} />
        <h1>Import framework edition</h1>
        {canAdministerTraining(req.user as User) ? (
          <ImportFrameworksForm competenciesURL={competenciesURL} />
        ) : (
          <p className="framework-import__refused">
            Only the Training Admin may import framework editions.
          </p>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}
