'use client'
import React from 'react'
import Link from 'next/link'
import type { TreeRow } from '@/courseware/competency-tree'

type Props = {
  /** Each competency after its parent, siblings in sheet order, as the CMS serves them. */
  rows: TreeRow[]
  /** Competencies whose children show. */
  open: ReadonlySet<string>
  onToggle: (id: string) => void
  /** Adds the GCAP column, for an edition carrying VATUSA's pairing. */
  showPairing: boolean
  /** Where choosing a competency goes: its page. */
  hrefFor: (row: TreeRow) => string
  /** While searching: the rows to show, and those of them that matched. */
  only?: ReadonlySet<string> | null
  matches?: ReadonlySet<string>
}

const baseClass = 'competency-tree'

/** The rows a person sees: each under an open parent, and in `only` when it is given. */
function visibleRows(
  rows: TreeRow[],
  open: ReadonlySet<string>,
  only?: ReadonlySet<string> | null,
) {
  const shown = new Set<string>()
  return rows.filter((row) => {
    const underOpenParent =
      row.parentId === null || (shown.has(row.parentId) && open.has(row.parentId))
    const visible = underOpenParent && (!only || only.has(row.id))
    if (visible) shown.add(row.id)
    return visible
  })
}

/**
 * Competencies as a tree: ID and title, and the paired GCAP code where the edition has one. A
 * competency with children opens and closes from its toggle; its ID or title opens its page.
 */
export function CompetencyTree({
  rows,
  open,
  onToggle,
  showPairing,
  hrefFor,
  only,
  matches,
}: Props) {
  return (
    <table className={`${baseClass}__table`}>
      <thead>
        <tr>
          <th scope="col">ID</th>
          <th scope="col">Title</th>
          {showPairing && (
            <th scope="col" className={`${baseClass}__gcap`}>
              GCAP
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {visibleRows(rows, open, only).map((row) => {
          const isOpen = open.has(row.id)
          return (
            <tr
              key={row.id}
              className={matches?.has(row.id) ? `${baseClass}__row--match` : undefined}
            >
              <td className={`${baseClass}__id`}>
                <span
                  className={`${baseClass}__indent`}
                  style={{ paddingInlineStart: `${row.depth * 1.25}rem` }}
                >
                  {row.hasChildren ? (
                    <button
                      type="button"
                      className={`${baseClass}__toggle`}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Close' : 'Open'} ${row.sourceId}`}
                      onClick={() => onToggle(row.id)}
                    >
                      {isOpen ? '▾' : '▸'}
                    </button>
                  ) : (
                    <span className={`${baseClass}__toggle`} aria-hidden="true" />
                  )}
                  <Link href={hrefFor(row)}>{row.sourceId}</Link>
                </span>
              </td>
              <td>
                <Link href={hrefFor(row)}>{row.title}</Link>
              </td>
              {showPairing && <td className={`${baseClass}__gcap`}>{row.pairedGcapCode}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
