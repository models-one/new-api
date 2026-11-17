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

import { DataTablePagination, useDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { PublicLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/use-debounce'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import { getGallery } from './api'
import { ArtifactImage, ArtworkDetails } from './artwork'
import type { PelicanArtwork } from './types'

export function PelicanGallery() {
  const queryClient = useQueryClient()
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const user = useAuthStore((state) => state.auth.user)
  const [search, setSearch] = useState('')
  const queryText = useDebounce(search, 250)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 8 })
  const [selected, setSelected] = useState<PelicanArtwork[]>([])
  const [preview, setPreview] = useState<PelicanArtwork[]>([])
  const gallery = useQuery({
    queryKey: ['pelican', 'gallery', queryText, pagination.pageIndex],
    queryFn: () => getGallery(queryText, pagination.pageIndex + 1),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  })
  const groups = gallery.data?.groups ?? []
  const { table } = useDataTable({
    data: groups,
    columns: [],
    manualPagination: true,
    totalCount: gallery.data?.total ?? 0,
    pagination,
    onPaginationChange: setPagination,
  })
  function select(run: PelicanArtwork, checked: boolean) {
    setSelected((current) =>
      checked
        ? [...current.filter((item) => item.id !== run.id), run].slice(0, 2)
        : current.filter((item) => item.id !== run.id)
    )
  }
  return (
    <PublicLayout showMainContainer={false}>
      <main className='mx-auto max-w-[1600px] space-y-7 px-4 pt-24 pb-10 sm:px-8'>
        <header className='flex flex-wrap items-start justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {t('Pelican tests')}
            </h1>
            <p className='text-muted-foreground mt-2'>
              {t('Browse model outputs by channel and model')}
            </p>
          </div>
          <Badge variant='secondary'>
            {t('Up to 20 artworks per group, retained for 7 days')}
          </Badge>
        </header>
        <div className='flex flex-wrap items-center gap-3'>
          <Input
            aria-label={t('Search channels or models')}
            placeholder={t('Search channels or models')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPagination((current) => ({ ...current, pageIndex: 0 }))
              setSelected([])
            }}
            className='w-full sm:max-w-sm'
          />
          <Button
            disabled={selected.length !== 2}
            onClick={() => setPreview(selected)}
          >
            {t('Compare artworks')} ({selected.length}/2)
          </Button>
          <Button
            variant='outline'
            onClick={() => {
              setSelected([])
              void gallery.refetch()
              void queryClient.invalidateQueries({
                queryKey: ['pelican-artifact'],
              })
            }}
            disabled={gallery.isFetching}
          >
            {t('Refresh')}
          </Button>
          {user && user.role >= 10 && (
            <Button variant='ghost' render={<Link to='/pelican-management' />}>
              {t('Manage tests')}
            </Button>
          )}
        </div>
        {gallery.isLoading && <LoadingState />}
        {gallery.isError && (
          <ErrorState onRetry={() => void gallery.refetch()} />
        )}
        {!gallery.isLoading && !gallery.isError && groups.length === 0 && (
          <EmptyState
            title={t('No artworks yet')}
            description={t('Published tests will appear here after generation')}
          />
        )}
        {!gallery.isLoading &&
          !gallery.isError &&
          groups.map((group) => (
            <section
              key={group.key}
              className='min-w-0 space-y-3'
              aria-label={`${group.channel_name} / ${group.model}`}
            >
              <Carousel opts={{ align: 'start', loop: false }}>
                <div className='mb-4 flex flex-wrap items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <h2 className='text-base font-semibold break-words'>
                      {group.channel_name} / {group.model}
                    </h2>
                    <p className='text-muted-foreground mt-1 text-sm'>
                      {t('{{count}} artworks', { count: group.runs.length })} ·{' '}
                      {group.interval_seconds
                        ? t('Every {{minutes}} minutes', {
                            minutes: formatNumber(
                              group.interval_seconds / 60,
                              locale
                            ),
                          })
                        : t('Manual only')}
                    </p>
                    {['failed', 'render_pending'].includes(
                      group.latest_status
                    ) && (
                      <p className='text-muted-foreground mt-1 text-sm'>
                        {t(
                          'Latest attempt did not finish successfully; previous artworks are shown'
                        )}
                      </p>
                    )}
                  </div>
                  <div className='flex gap-2'>
                    <CarouselPrevious
                      className='static translate-y-0'
                      aria-label={t('Newer artworks')}
                    />
                    <CarouselNext
                      className='static translate-y-0'
                      aria-label={t('Older artworks')}
                    />
                  </div>
                </div>
                {group.runs.length === 0 ? (
                  <p className='text-muted-foreground rounded-lg border border-dashed p-6'>
                    {t('No artworks yet')}
                  </p>
                ) : (
                  <CarouselContent>
                    {group.runs.map((run, index) => (
                      <CarouselItem
                        key={run.id}
                        className='basis-[85%] sm:basis-[280px]'
                      >
                        <article className='bg-card overflow-hidden rounded-xl border'>
                          <Button
                            variant='ghost'
                            className='h-auto w-full overflow-hidden rounded-none p-0'
                            aria-label={t('View artwork')}
                            onClick={() => setPreview([run])}
                          >
                            <ArtifactImage run={run} />
                          </Button>
                          <div className='space-y-2 p-4'>
                            <div className='flex items-center justify-between gap-2'>
                              <span className='truncate font-mono text-sm'>
                                {run.model}
                              </span>
                              {index === 0 && (
                                <Badge variant='secondary'>{t('Latest')}</Badge>
                              )}
                            </div>
                            <div className='text-muted-foreground flex flex-wrap justify-between gap-1 text-xs'>
                              <span>
                                {new Date(
                                  run.generated_at * 1000
                                ).toLocaleString(locale, {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <span>
                                {t('{{seconds}} s', {
                                  seconds: formatNumber(
                                    (run.generation?.duration_ms ?? 0) / 1000,
                                    locale
                                  ),
                                })}
                              </span>
                            </div>
                            <p className='text-muted-foreground text-xs'>
                              {t('Conditions version {{version}}', {
                                version: run.revision,
                              })}
                            </p>
                            <label className='flex min-h-7 items-center gap-2 text-sm'>
                              <Checkbox
                                aria-label={t('Compare artwork from {{time}}', {
                                  time: new Date(
                                    run.generated_at * 1000
                                  ).toLocaleString(locale),
                                })}
                                checked={selected.some(
                                  (item) => item.id === run.id
                                )}
                                disabled={
                                  selected.length >= 2 &&
                                  !selected.some((item) => item.id === run.id)
                                }
                                onCheckedChange={(checked) =>
                                  select(run, !!checked)
                                }
                              />
                              {t('Add to comparison')}
                            </label>
                          </div>
                        </article>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                )}
              </Carousel>
            </section>
          ))}
        <DataTablePagination table={table} compact />
        <ArtworkDetails runs={preview} onClose={() => setPreview([])} />
      </main>
    </PublicLayout>
  )
}
