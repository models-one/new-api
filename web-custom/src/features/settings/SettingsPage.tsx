import { useQuery } from '@tanstack/react-query'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import RotateCcwIcon from 'lucide-react/dist/esm/icons/rotate-ccw'
import Rows3Icon from 'lucide-react/dist/esm/icons/rows-3'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SearchInput } from '@/components/form'
import { Button, PageHeader, Pagination, SegmentedControl, Skeleton } from '@/components/ui'
import type { SegmentedControlOption } from '@/components/ui'
import { ApiKeyCard } from '@/features/settings/components/ApiKeyCard'
import { ApiKeyEditorDialog } from '@/features/settings/components/ApiKeyEditorDialog'
import { LoadErrorAlert } from '@/features/settings/components/LoadErrorAlert'
import { isEnabled, tokenGroupNames } from '@/features/settings/routing'
import type { ApiKeyEditorTarget, StatusFilter } from '@/features/settings/types'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { tokenListQuery, tokenSearchQuery, type ApiToken } from '@/lib/api/tokens'
import { userGroupsQuery } from '@/lib/api/user'

const PAGE_SIZE = 10

/**
 * `GET /api/token/search` matches `name LIKE keyword`: without a `%` the match is exact.
 * The backend rejects a pattern whose non-wildcard part is shorter than this, so a
 * one-character term is sent verbatim (an exact match) rather than as a contains-search.
 */
const MIN_WILDCARD_TERM_LENGTH = 2

/** There is no server-side search over group names, so the search box only promises names. */
function toSearchKeyword(term: string): string {
  const trimmed = term.trim()
  if (trimmed === '') return ''
  if (trimmed.includes('%')) return trimmed
  if (trimmed.length < MIN_WILDCARD_TERM_LENGTH) return trimmed
  return `%${trimmed}%`
}

/**
 * `model.Token.Status` has four values. "Disabled" here means every state that is not
 * enabled — manually disabled (2), expired (3) and exhausted (4) — so the two counts
 * always add up to the number of keys on the page. Each card still shows its exact status.
 */
function matchesStatusFilter(token: ApiToken, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  return filter === 'enabled' ? isEnabled(token) : !isEnabled(token)
}

export function SettingsPage() {
  const { t } = useTranslation()
  const quotaPerUnit = useQuotaPerUnit()

  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedIds, setExpandedIds] = useState(() => new Set<number>())
  const [editorTarget, setEditorTarget] = useState<ApiKeyEditorTarget | null>(null)

  const keyword = toSearchKeyword(searchTerm)
  const listQuery = useQuery({ ...tokenListQuery(page, PAGE_SIZE), enabled: keyword === '' })
  const searchQuery = useQuery(tokenSearchQuery(keyword, page, PAGE_SIZE))
  const tokensQuery = keyword === '' ? listQuery : searchQuery

  const groupsQuery = useQuery(userGroupsQuery())

  const pageTokens = tokensQuery.data?.items ?? []
  // Applied client-side: GET /api/token/ and /api/token/search accept only `p` and
  // `page_size` — there is no status, group or sort parameter to push this to the server.
  const visibleTokens = pageTokens.filter((token) => matchesStatusFilter(token, statusFilter))
  const enabledCount = pageTokens.filter(isEnabled).length
  const loaded = tokensQuery.data !== undefined

  const allExpanded = pageTokens.length > 0 && pageTokens.every((token) => expandedIds.has(token.id))
  const filtersActive = searchTerm !== '' || statusFilter !== 'all'

  const statusOptions: SegmentedControlOption<StatusFilter>[] = [
    { id: 'all', label: t('All keys'), count: loaded ? pageTokens.length : undefined },
    { id: 'enabled', label: t('Enabled'), count: loaded ? enabledCount : undefined },
    {
      id: 'disabled',
      label: t('Disabled'),
      count: loaded ? pageTokens.length - enabledCount : undefined,
    },
  ]

  const toggleExpanded = (tokenId: number) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(tokenId)) next.delete(tokenId)
      else next.add(tokenId)
      return next
    })
  }

  const resetFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        action={(
          <Button onClick={() => setEditorTarget({ mode: 'create' })}>
            <PlusIcon aria-hidden="true" />
            {t('New API key')}
          </Button>
        )}
        description={t('Keys, quotas, and model group routing.')}
        title={t('API keys')}
      />

      <section aria-label={t('API key filters')} className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedControl
            className="w-full lg:w-auto"
            fullWidth
            label={t('Filter by status')}
            onChange={(nextFilter) => setStatusFilter(nextFilter)}
            options={statusOptions}
            value={statusFilter}
          />

          <Button
            aria-label={allExpanded ? t('Collapse all keys') : t('Expand all keys')}
            onClick={() => setExpandedIds(
              allExpanded ? new Set() : new Set(pageTokens.map((token) => token.id)),
            )}
            title={allExpanded ? t('Collapse all keys') : t('Expand all keys')}
            variant="quiet"
          >
            <Rows3Icon aria-hidden="true" />
            {allExpanded ? t('Collapse all') : t('Expand all')}
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <SearchInput
            className="min-w-0 flex-1"
            debounceMs={300}
            hideLabel
            label={t('Search key name')}
            onValueChange={(nextTerm) => {
              setSearchTerm(nextTerm)
              setPage(1)
            }}
            placeholder={t('Search key name')}
            value={searchTerm}
          />
          <Button disabled={!filtersActive} onClick={resetFilters} variant="quiet">
            <RotateCcwIcon aria-hidden="true" />
            {t('Reset filters')}
          </Button>
        </div>

        {statusFilter === 'all' ? null : (
          <p className="text-xs leading-5 text-muted">
            {t('The status filter applies to the keys on this page only — the server returns every status.')}
          </p>
        )}
      </section>

      <section aria-busy={tokensQuery.isFetching} aria-label={t('API keys')} className="flex flex-col gap-3">
        {tokensQuery.isError ? (
          <LoadErrorAlert
            error={tokensQuery.error}
            isRetrying={tokensQuery.isFetching}
            onRetry={() => void tokensQuery.refetch()}
          />
        ) : null}

        {/* Without the group map a route's ratio is unknown, not absent — say so once here. */}
        {groupsQuery.isError ? (
          <LoadErrorAlert
            error={groupsQuery.error}
            isRetrying={groupsQuery.isFetching}
            onRetry={() => void groupsQuery.refetch()}
          />
        ) : null}

        {tokensQuery.isPending && !tokensQuery.isError ? (
          <div className="flex flex-col gap-3" role="status">
            <span className="sr-only">{t('Loading API keys')}</span>
            {Array.from({ length: 3 }, (_unused, index) => (
              <Skeleton className="h-40 w-full" key={index} variant="block" />
            ))}
          </div>
        ) : null}

        {loaded ? (
          <>
            <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted">
              <p className="flex items-center gap-2">
                <KeyRoundIcon aria-hidden="true" className="size-4 text-primary" />
                {t('{{count}} keys', { count: visibleTokens.length })}
              </p>
              <p>
                {t('{{count}} group routes', {
                  count: visibleTokens.reduce(
                    (total, token) => total + tokenGroupNames(token).length,
                    0,
                  ),
                })}
              </p>
            </div>

            {visibleTokens.map((token) => (
              <ApiKeyCard
                expanded={expandedIds.has(token.id)}
                groups={groupsQuery.data}
                groupsKnown={groupsQuery.data !== undefined}
                groupsPending={groupsQuery.isPending}
                key={token.id}
                onEdit={() => setEditorTarget({ mode: 'edit', token })}
                onToggleExpanded={() => toggleExpanded(token.id)}
                quotaPerUnit={quotaPerUnit}
                token={token}
              />
            ))}

            {visibleTokens.length === 0 ? (
              <div className="grid min-h-52 place-items-center border-y border-border text-center">
                <div className="px-4">
                  <KeyRoundIcon aria-hidden="true" className="mx-auto size-8 text-muted" />
                  <p className="mt-3 text-sm text-muted">
                    {filtersActive
                      ? t('No API keys match these filters.')
                      : t('You have not created an API key yet.')}
                  </p>
                  {filtersActive ? null : (
                    <Button className="mt-4" onClick={() => setEditorTarget({ mode: 'create' })}>
                      <PlusIcon aria-hidden="true" />
                      {t('New API key')}
                    </Button>
                  )}
                </div>
              </div>
            ) : null}

            <Pagination
              className="pt-2"
              label={t('API key pages')}
              onPageChange={setPage}
              page={page}
              pageSize={PAGE_SIZE}
              total={tokensQuery.data.total}
            />
          </>
        ) : null}
      </section>

      {editorTarget ? (
        <ApiKeyEditorDialog
          groups={{
            data: groupsQuery.data,
            error: groupsQuery.error,
            isError: groupsQuery.isError,
            isFetching: groupsQuery.isFetching,
            isPending: groupsQuery.isPending,
            refetch: () => void groupsQuery.refetch(),
          }}
          key={editorTarget.mode === 'edit' ? editorTarget.token.id : 'create'}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditorTarget(null)
          }}
          open
          quotaPerUnit={quotaPerUnit}
          target={editorTarget}
        />
      ) : null}
    </div>
  )
}
