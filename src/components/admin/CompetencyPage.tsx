import React from 'react'
import Link from 'next/link'
import { formatAdminURL } from 'payload/shared'
import type { UIFieldServerProps } from 'payload'
import { loadCompetencyPage } from '@/courseware/competency-page'

const baseClass = 'competency-page'

/** The line at the top of a competency's page. */
export const CompetencyImportNote = () => (
  <p className={`${baseClass}__note`}>Competencies come from the import and are read-only here.</p>
)

/**
 * The competencies directly beneath this one and the tasks that teach it. Both are read here, on
 * the server, for the person signed in.
 */
export async function CompetencyRelations({ id, req, payload }: UIFieldServerProps) {
  if (!id) return null
  const { children, taughtBy } = await loadCompetencyPage(req, String(id))
  const hrefTo = (collection: string, target: string) =>
    formatAdminURL({
      adminRoute: payload.config.routes.admin,
      path: `/collections/${collection}/${target}`,
    })

  return (
    <>
      <section className={`field-type ${baseClass}__section`}>
        <h3 className={`${baseClass}__heading`}>
          Children <span className={`${baseClass}__count`}>{children.length}</span>
        </h3>
        {children.length === 0 ? (
          <p className={`${baseClass}__none`}>No competencies beneath this one.</p>
        ) : (
          <table className={`${baseClass}__table`}>
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Title</th>
                <th scope="col" className={`${baseClass}__text`}>
                  Text
                </th>
              </tr>
            </thead>
            <tbody>
              {children.map((child) => (
                <tr key={child.id}>
                  <td className={`${baseClass}__id`}>
                    <Link href={hrefTo('competencies', child.id)}>{child.sourceId}</Link>
                  </td>
                  <td>
                    <Link href={hrefTo('competencies', child.id)}>{child.title}</Link>
                    {child.beneath > 0 && (
                      <span className={`${baseClass}__count`}> · {child.beneath} beneath</span>
                    )}
                  </td>
                  <td className={`${baseClass}__text`}>
                    {child.text ? (
                      child.text
                    ) : (
                      <span className={`${baseClass}__count`}>Heading</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={`field-type ${baseClass}__section`}>
        <h3 className={`${baseClass}__heading`}>
          Taught by <span className={`${baseClass}__count`}>{taughtBy.length}</span>
        </h3>
        {taughtBy.length === 0 ? (
          <p className={`${baseClass}__none`}>No task is mapped to this competency.</p>
        ) : (
          <ul className={`${baseClass}__tasks`}>
            {taughtBy.map((task) => (
              <li key={task.id}>
                <Link href={hrefTo('tasks', task.id)}>
                  <span className={`${baseClass}__id`}>{task.number}</span> {task.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
