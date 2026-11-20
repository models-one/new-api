/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/form/Checkbox'
import { Input } from '@/components/form/Input'
import { EmptyState } from '@/components/system/EmptyState'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { Spinner } from '@/components/ui/Spinner'
import { useChannelsAccess } from '@/features/channels/access'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatDateTime, formatLatencyMs, formatNumber } from '@/lib/format'
import { errorDetails, getGallery } from './api'
import { ArtifactImage, ArtworkDetails } from './artwork'
import type { PelicanArtwork } from './types'

export function PelicanGallery() {
  const cache = useQueryClient()
  const { t, i18n } = useTranslation()
  const access = useChannelsAccess()
  const [search, setSearch] = useState('')
  const queryText = useDebouncedValue(search, 250)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<PelicanArtwork[]>([])
  const [preview, setPreview] = useState<PelicanArtwork[]>([])
  const gallery = useQuery({
    queryKey: ['pelican', 'gallery', queryText, page],
    queryFn: () => getGallery(queryText, page),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  })
  const groups = gallery.data?.groups ?? []
  return (
    <div className="min-w-0 space-y-7">
      <PageHeader
        title={t('Pelican tests')}
        description={t('Browse model outputs by channel and model')}
        action={
          access.can.read && (
            <Button variant="outline" render={<Link to="/pelican-management" />}>
              {t('Manage tests')}
            </Button>
          )
        }
      />
      <p className="text-sm text-muted">{t('Up to 20 artworks per group, retained for 7 days')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          label={t('Search channels or models')}
          hideLabel
          placeholder={t('Search channels or models')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
            setSelected([])
          }}
          className="w-full sm:max-w-sm"
        />
        <Button disabled={selected.length !== 2} onClick={() => setPreview(selected)}>
          {t('Compare artworks')} ({selected.length}/2)
        </Button>
        <Button
          variant="outline"
          disabled={gallery.isFetching}
          onClick={() => {
            setSelected([])
            void gallery.refetch()
            void cache.invalidateQueries({ queryKey: ['pelican-artifact'] })
          }}
        >
          {t('Refresh')}
        </Button>
      </div>
      {gallery.isLoading && <Spinner label={t('Loading')} />}
      {gallery.isError && (
        <Alert
          tone="destructive"
          action={
            <Button variant="outline" onClick={() => void gallery.refetch()}>
              {t('Retry')}
            </Button>
          }
        >
          {errorDetails(gallery.error)}
        </Alert>
      )}
      {!gallery.isLoading && !gallery.isError && groups.length === 0 && (
        <EmptyState
          title={t('No artworks yet')}
          description={t('Published tests will appear here after generation')}
        />
      )}
      {!gallery.isError &&
        groups.map((group) => (
          <section
            key={group.key}
            className="min-w-0 space-y-4"
            aria-label={`${group.channel_name} / ${group.model}`}
          >
            <div>
              <h2 className="break-words text-base font-semibold">
                {group.channel_name} / {group.model}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {t('{{count}} artworks', { count: group.runs.length })} ·{' '}
                {group.interval_seconds
                  ? t('Every {{minutes}} minutes', {
                      minutes: formatNumber(group.interval_seconds / 60),
                    })
                  : t('Manual only')}
              </p>
              {['failed', 'render_pending'].includes(group.latest_status) && (
                <p className="mt-1 text-sm text-muted">
                  {t('Latest attempt did not finish successfully; previous artworks are shown')}
                </p>
              )}
            </div>
            {group.runs.length === 0 ? (
              <p className="text-sm text-muted">{t('No artworks yet')}</p>
            ) : (
              <ul
                className="flex snap-x snap-proximity gap-4 overflow-x-auto pb-4 focus-visible:outline-primary"
                tabIndex={0}
                aria-label={`${group.channel_name} / ${group.model}`}
              >
                {group.runs.map((run, index) => (
                  <li key={run.id} className="w-[min(280px,85%)] shrink-0 snap-start">
                    <article className="panel overflow-hidden">
                      <Button
                        variant="quiet"
                        className="w-full overflow-hidden rounded-none p-0"
                        aria-label={t('View artwork')}
                        onClick={() => setPreview([run])}
                      >
                        <ArtifactImage run={run} />
                      </Button>
                      <div className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-sm" title={run.model}>
                            {run.model}
                          </span>
                          {index === 0 && <Badge>{t('Latest')}</Badge>}
                        </div>
                        <div className="flex flex-wrap justify-between gap-1 text-xs text-muted">
                          <span>{formatDateTime(run.generated_at, i18n.language)}</span>
                          <span>{formatLatencyMs(run.generation?.duration_ms ?? 0)}</span>
                        </div>
                        <p className="text-xs text-muted">
                          {t('Conditions version {{version}}', {
                            version: run.revision,
                          })}
                        </p>
                        <Checkbox
                          label={t('Add to comparison')}
                          ariaLabel={t('Compare artwork from {{time}}', {
                            time: formatDateTime(run.generated_at, i18n.language),
                          })}
                          checked={selected.some((item) => item.id === run.id)}
                          disabled={
                            selected.length >= 2 && !selected.some((item) => item.id === run.id)
                          }
                          onCheckedChange={(checked) =>
                            setSelected((current) =>
                              checked
                                ? [...current.filter((item) => item.id !== run.id), run].slice(0, 2)
                                : current.filter((item) => item.id !== run.id),
                            )
                          }
                        />
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      <Pagination
        page={page}
        pageSize={8}
        total={gallery.data?.total ?? 0}
        onPageChange={(next) => {
          setPage(next)
          setSelected([])
        }}
        compact
      />
      <ArtworkDetails runs={preview} onClose={() => setPreview([])} />
    </div>
  )
}
