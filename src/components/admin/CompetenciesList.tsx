'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, Gutter, SearchIcon, useConfig, useStepNav } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import type { CompetencyTree as Tree, TreeRow } from '@/courseware/competency-tree'
import { CompetencyTree } from './CompetencyTree'

const baseClass = 'competency-tree'

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Keeps the tab and search in the address, so coming back from a competency finds them again. */
function rememberInAddress(edition: string | null, search: string) {
  const params = new URLSearchParams(window.location.search)
  if (edition) params.set('edition', edition)
  else params.delete('edition')
  if (search) params.set('search', search)
  else params.delete('search')
  const query = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
}

/**
 * The Competencies list: one tab per framework edition, each edition's competencies as a tree.
 * Editions come from the import and are not edited here.
 */
export function CompetenciesList() {
  const {
    config: { routes, serverURL },
  } = useConfig()
  const { setStepNav } = useStepNav()
  const params = useSearchParams()

  const [edition, setEdition] = useState<string | null>(params.get('edition'))
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [query, setQuery] = useState(search.trim())
  const [tree, setTree] = useState<Tree | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [searchOpen, setSearchOpen] = useState<Set<string>>(new Set())

  useEffect(() => setStepNav([{ label: 'Competencies' }]), [setStepNav])

  // A search runs once typing pauses.
  useEffect(() => {
    const wait = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(wait)
  }, [search])

  useEffect(() => {
    rememberInAddress(edition, query)
    const controller = new AbortController()
    const url = new URL(
      formatAdminURL({ apiRoute: routes.api, serverURL, path: '/courseware/competency-tree' }),
      window.location.origin,
    )
    if (edition) url.searchParams.set('edition', edition)
    if (query) url.searchParams.set('search', query)
    fetch(url, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        // An edition that has gone: show the first instead.
        if (response.status === 404 && edition) return setEdition(null)
        if (!response.ok) throw new Error(String(response.status))
        const next: Tree = await response.json()
        setTree(next)
        setFailed(false)
        setSearchOpen(new Set(next.search?.open ?? []))
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setFailed(true)
      })
    return () => controller.abort()
  }, [edition, query, routes.api, serverURL])

  const current = tree?.edition ?? null
  const searching = Boolean(tree?.search)
  const shownOpen = searching ? searchOpen : open
  const parents = useMemo(
    () => (current?.competencies ?? []).filter((row) => row.hasChildren).map((row) => row.id),
    [current],
  )
  const allOpen = parents.length > 0 && parents.every((id) => shownOpen.has(id))

  const toggle = useCallback(
    (id: string) => {
      const flip = (previous: Set<string>) => {
        const next = new Set(previous)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }
      if (searching) setSearchOpen(flip)
      else setOpen(flip)
    },
    [searching],
  )

  const expandAll = () => {
    const next = new Set(allOpen ? [] : parents)
    if (searching) setSearchOpen(next)
    else setOpen(next)
  }

  const chooseEdition = (id: string) => {
    if (id === current?.id) return
    setOpen(new Set())
    setEdition(id)
  }

  const hrefFor = useCallback(
    (row: TreeRow) =>
      formatAdminURL({ adminRoute: routes.admin, path: `/collections/competencies/${row.id}` }),
    [routes.admin],
  )

  const only = useMemo(
    () => (tree?.search ? new Set([...tree.search.matches, ...tree.search.open]) : null),
    [tree],
  )
  const matches = useMemo(() => new Set(tree?.search?.matches ?? []), [tree])

  return (
    <div className={`collection-list collection-list--competencies ${baseClass}`}>
      <Gutter className="collection-list__wrap">
        <header className={`${baseClass}__header`}>
          <h1>Competencies</h1>
        </header>

        {failed && <p className={`${baseClass}__note`}>The competencies could not be loaded.</p>}
        {tree && tree.editions.length === 0 && (
          <p className={`${baseClass}__note`}>
            No framework editions yet. They arrive by the import.
          </p>
        )}

        {tree && tree.editions.length > 0 && (
          <div className={`${baseClass}__tabs`} role="tablist" aria-label="Framework editions">
            {tree.editions.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === current?.id}
                className={`${baseClass}__tab`}
                onClick={() => chooseEdition(tab.id)}
              >
                {tab.name} {tab.edition}
              </button>
            ))}
          </div>
        )}

        {current && (
          <div role="tabpanel" aria-label={`${current.name} ${current.edition}`}>
            <p className={`${baseClass}__summary`}>
              <strong>
                {current.name} {current.edition}
              </strong>{' '}
              · {current.count} {current.count === 1 ? 'competency' : 'competencies'} · updated{' '}
              {shortDate(current.updatedAt)}
            </p>

            <div className={`${baseClass}__toolbar`}>
              <div className={`search-filter ${baseClass}__search`}>
                <input
                  className="search-filter__input"
                  type="search"
                  placeholder="Search by ID or title"
                  aria-label="Search by ID or title"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <SearchIcon />
              </div>
              {parents.length > 0 && (
                <Button buttonStyle="secondary" size="small" margin={false} onClick={expandAll}>
                  {allOpen ? 'Collapse all' : 'Expand all'}
                </Button>
              )}
            </div>

            {searching && tree?.search?.matches.length === 0 ? (
              <p className={`${baseClass}__note`}>
                Nothing in {current.name} {current.edition} matches “{query}”.
              </p>
            ) : (
              <CompetencyTree
                rows={current.competencies}
                open={shownOpen}
                onToggle={toggle}
                showPairing={current.showsPairing}
                hrefFor={hrefFor}
                only={only}
                matches={matches}
              />
            )}
          </div>
        )}
      </Gutter>
    </div>
  )
}
