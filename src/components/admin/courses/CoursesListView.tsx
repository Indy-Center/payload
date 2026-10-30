import React from 'react'
import Link from 'next/link'
import { createLocalReq, type ListViewClientProps, type ListViewServerProps } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { Button, DefaultListView, Gutter, SetStepNav } from '@payloadcms/ui'
import { loadCredentialList } from '@/courseware/credential-list'
import { CourseListTabs } from './CourseListTabs'

/**
 * The Courses list with two tabs (ticket 22): Courses, Payload's own list as ticket 20 set it up,
 * and Credentials, which are kept from here rather than the nav. The Credentials collection's own
 * list and pages still open by link.
 */
export async function CoursesListView(props: ListViewServerProps) {
  if (props.searchParams?.tab === 'credentials') return <CredentialsTab {...props} />
  return (
    <DefaultListView {...clientProps(props)} Description={<CourseListTabs current="courses" />} />
  )
}

/** Only what Payload's own list takes: the server's objects can't cross to the browser. */
function clientProps(props: ListViewServerProps): ListViewClientProps {
  const {
    AfterList,
    AfterListTable,
    beforeActions,
    BeforeList,
    BeforeListTable,
    collectionSlug,
    columnState,
    Description,
    disableBulkDelete,
    disableBulkEdit,
    disableQueryPresets,
    enableRowSelections,
    hasCreatePermission,
    hasDeletePermission,
    hasTrashPermission,
    listMenuItems,
    newDocumentURL,
    queryPreset,
    queryPresetPermissions,
    renderedFilters,
    resolvedFilterOptions,
    Table,
    viewType,
  } = props
  return {
    AfterList,
    AfterListTable,
    beforeActions,
    BeforeList,
    BeforeListTable,
    collectionSlug,
    columnState,
    Description,
    disableBulkDelete,
    disableBulkEdit,
    disableQueryPresets,
    enableRowSelections,
    hasCreatePermission,
    hasDeletePermission,
    hasTrashPermission,
    listMenuItems,
    newDocumentURL,
    queryPreset,
    queryPresetPermissions,
    renderedFilters,
    resolvedFilterOptions,
    Table,
    viewType,
  }
}

const KINDS = { certification: 'Certification', endorsement: 'Endorsement' } as const

/**
 * Every credential with who issues it, worked out from the courses. Retired ones are hidden unless
 * asked for; "New credential" is for those who may create one, the Training Admin and leads (06).
 */
async function CredentialsTab({ payload, user, permissions, searchParams }: ListViewServerProps) {
  const showRetired = searchParams?.retired === 'true'
  const req = await createLocalReq({ user }, payload)
  const rows = await loadCredentialList(req, { showRetired })
  const admin = payload.config.routes.admin
  const url = (path: `/${string}`) => formatAdminURL({ adminRoute: admin, path })
  const tabURL = `${url('/collections/courses')}?tab=credentials`

  return (
    <Gutter className="credentials-tab">
      <SetStepNav
        nav={[{ label: 'Courses', url: url('/collections/courses') }, { label: 'Credentials' }]}
      />
      <header className="list-header">
        <div className="list-header__content">
          <div className="list-header__title-and-actions">
            <h1 className="list-header__title">Courses</h1>
            {permissions?.collections?.credentials?.create ? (
              <div className="list-header__title-actions">
                <Button
                  buttonStyle="pill"
                  el="link"
                  size="small"
                  to={url('/collections/credentials/create')}
                >
                  New credential
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <CourseListTabs current="credentials" />
      <p className="credentials-tab__retired">
        <Link href={showRetired ? tabURL : `${tabURL}&retired=true`}>
          {showRetired ? 'Hide retired' : 'Show retired'}
        </Link>
      </p>
      {rows.length === 0 ? (
        <p>No credentials yet.</p>
      ) : (
        <div className="table credentials-tab__table">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Kind</th>
                <th>Name</th>
                <th>Rank</th>
                <th>Granted on arrival</th>
                <th>Issued by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={url(`/collections/credentials/${row.id}`)}>{row.code}</Link>
                    {row.retired && <span className="edition-tag">Retired</span>}
                  </td>
                  <td>{KINDS[row.kind]}</td>
                  <td>{row.name}</td>
                  <td>{row.rank ?? '—'}</td>
                  <td>{row.grantedOnArrival.join(', ') || '—'}</td>
                  <td>
                    {row.issuedBy ? (
                      <Link href={url(`/collections/courses/${row.issuedBy.id}`)}>
                        {row.issuedBy.code}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Gutter>
  )
}
