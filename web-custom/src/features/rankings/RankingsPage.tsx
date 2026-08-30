import { useQuery } from '@tanstack/react-query'
import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import LockIcon from 'lucide-react/dist/esm/icons/lock'
import SparklesIcon from 'lucide-react/dist/esm/icons/sparkles'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import TrophyIcon from 'lucide-react/dist/esm/icons/trophy'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { EmptyState } from '@/components/system/EmptyState'
import {
  Alert,
  Button,
  PageHeader,
  Panel,
  SegmentedControl,
  Skeleton,
  StatCard,
  type SegmentedControlOption,
} from '@/components/ui'
import {
  DEFAULT_RANKING_PERIOD,
  RANKED_MODEL_LIMIT,
  RANKING_PERIODS,
  publicRankingsQuery,
  type RankingPeriod,
} from '@/features/rankings/api'
import { ModelVolumeChart, VendorShareChart } from '@/features/rankings/components/HistoryCharts'
import { ModelLeaderboard } from '@/features/rankings/components/ModelLeaderboard'
import { MoversPanel } from '@/features/rankings/components/MoversPanel'
import { RankingsFrame } from '@/features/rankings/components/RankingsFrame'
import { VendorLeaderboard } from '@/features/rankings/components/VendorLeaderboard'
import { rankingsModuleAccess } from '@/features/rankings/module-access'
import { rankingsFailureKind } from '@/features/rankings/request-failure'
import {
  formatShare,
  newEntrantCount,
  rankedShareCovered,
  rankedTokenTotal,
} from '@/features/rankings/rankings-presentation'
import { useServerStatus } from '@/hooks/use-server-status'
import { formatNumber, formatTokens } from '@/lib/format'
import { getLegacySignInHref } from '@/lib/navigation'

/**
 * The public model rankings.
 *
 * Anonymous by construction: it lives outside the console auth guard and requests only
 * `/api/status` and `/api/rankings`, both of which the gateway serves to visitors while the
 * `rankings` nav module stays public. No authenticated endpoint is touched on first render or
 * any later one.
 *
 * Everything shown comes from `GET /api/rankings`. That payload carries token counts, shares,
 * growth percentages, rank movement and two bucketed histories — and nothing else. There is no
 * per-category dimension (the wire's `category` field is hardcoded to `"all"` server-side), no
 * request count, no spend and no latency, so this page has no UI for any of them.
 */
export function RankingsPage() {
  const { t } = useTranslation()

  // `/api/status` decides whether this surface exists at all, so it is read before the
  // leaderboard is requested and nothing rankings-shaped renders while it is pending.
  const status = useServerStatus()
  const access = rankingsModuleAccess(status.data)
  const moduleReady = status.isSuccess && access.enabled

  const [period, setPeriod] = useState<RankingPeriod>(DEFAULT_RANKING_PERIOD)

  const rankings = useQuery({ ...publicRankingsQuery(period), enabled: moduleReady })

  const periodLabels: Record<RankingPeriod, string> = useMemo(
    () => ({
      today: t('Last 24 hours'),
      week: t('Last 7 days'),
      month: t('Last 30 days'),
      year: t('Last 365 days'),
    }),
    [t],
  )

  const baselineLabels: Record<RankingPeriod, string> = useMemo(
    () => ({
      today: t('the previous 24 hours'),
      week: t('the previous 7 days'),
      month: t('the previous 30 days'),
      year: t('the previous 365 days'),
    }),
    [t],
  )

  const periodOptions: SegmentedControlOption<RankingPeriod>[] = RANKING_PERIODS.map((id) => ({
    id,
    label: periodLabels[id],
  }))

  const snapshot = rankings.data
  const models = useMemo(() => snapshot?.models ?? [], [snapshot])
  const vendors = useMemo(() => snapshot?.vendors ?? [], [snapshot])

  const tokenTotal = useMemo(() => rankedTokenTotal(models), [models])
  const shareCovered = useMemo(() => rankedShareCovered(models), [models])
  const newEntrants = useMemo(() => newEntrantCount(models), [models])

  const periodLabel = periodLabels[period]
  const baseline = baselineLabels[period]

  // Which of the gateway's two refusals came back, if either. `/api/status` is read first so
  // neither should normally happen, but the option can change between the two requests and the
  // status answer can come from a five-minute-old cache.
  const failure = rankings.isError ? rankingsFailureKind(rankings.error) : undefined

  const header = (
    <PageHeader
      description={t(
        'Which models and providers this gateway relayed the most tokens through. Counted across everyone’s traffic, never your own.',
      )}
      eyebrow={t('Public rankings')}
      title={t('Model rankings')}
    />
  )

  if (status.isLoading) {
    return (
      <RankingsFrame>
        <div className="flex flex-col gap-8">
          {header}
          <Skeleton className="h-96" label={t('Loading the rankings')} variant="block" />
        </div>
      </RankingsFrame>
    )
  }

  if (status.isError) {
    return (
      <RankingsFrame>
        <div className="flex flex-col gap-8">
          {header}
          <Alert
            action={
              <Button
                aria-busy={status.isFetching}
                disabled={status.isFetching}
                onClick={() => void status.refetch()}
                variant="outline"
              >
                {t('Try again')}
              </Button>
            }
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('Could not load the site configuration')}
            tone="destructive"
          >
            {toErrorMessage(status.error)}
          </Alert>
        </div>
      </RankingsFrame>
    )
  }

  // The operator turned the module off. `/api/rankings` would only answer 403, so nothing is
  // requested and the page does not pretend the leaderboard exists. A 403 that came back anyway
  // says the same thing, later, and lands in the same state.
  if (!access.enabled || failure === 'disabled') {
    return (
      <RankingsFrame>
        <div className="flex flex-col gap-8">
          {header}
          <Panel>
            <EmptyState
              description={t('This gateway has turned the public rankings page off.')}
              title={t('Rankings are not published here')}
            />
          </Panel>
        </div>
      </RankingsFrame>
    )
  }

  // The operator can require a sign-in for this module; the request then answers 401 and the
  // only useful thing to offer is the sign-in link. Anything else that failed is reported as
  // itself — a dropped connection on a gated deployment is not a sign-in problem.
  const signInRequired = failure === 'sign-in-required'
  const isEmpty = rankings.isSuccess && models.length === 0 && vendors.length === 0

  return (
    <RankingsFrame>
      <div className="flex flex-col gap-8">
        {header}

        {access.requireAuth && failure === undefined ? (
          <Alert icon={<LockIcon aria-hidden="true" />} tone="info">
            {t('This gateway publishes rankings to signed-in visitors only.')}
          </Alert>
        ) : null}

        <SegmentedControl<RankingPeriod>
          label={t('Ranking period')}
          onChange={setPeriod}
          options={periodOptions}
          value={period}
        />

        {signInRequired ? (
          <Alert
            action={
              <Button render={<a href={getLegacySignInHref()} />} variant="outline">
                {t('Sign in')}
              </Button>
            }
            icon={<LockIcon aria-hidden="true" />}
            title={t('Sign in to see rankings')}
            tone="info"
          >
            {t('This gateway publishes rankings to signed-in visitors only.')}
          </Alert>
        ) : null}

        {failure === 'other' ? (
          <Alert
            action={
              <Button
                aria-busy={rankings.isFetching}
                disabled={rankings.isFetching}
                onClick={() => void rankings.refetch()}
                variant="outline"
              >
                {t('Try again')}
              </Button>
            }
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('Could not load the rankings')}
            tone="destructive"
          >
            {toErrorMessage(rankings.error)}
          </Alert>
        ) : null}

        {rankings.isLoading ? (
          <div className="flex flex-col gap-5">
            <Skeleton className="h-28" label={t('Loading the rankings')} variant="block" />
            <Skeleton className="h-96" variant="block" />
          </div>
        ) : null}

        {isEmpty ? (
          <Panel>
            <EmptyState
              description={t(
                'This gateway relayed no traffic in {{period}}, so there is nothing to rank yet.',
                { period: periodLabel },
              )}
              title={t('No rankings for this window')}
            />
          </Panel>
        ) : null}

        {rankings.isSuccess && !isEmpty ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                footer={t(
                  'Derived: sum of total_tokens over the ranked rows, which the server caps at rankingLeaderboardLimit = {{limit}}.',
                  { limit: RANKED_MODEL_LIMIT },
                )}
                icon={<ActivityIcon />}
                label={t('Tokens ranked')}
                value={formatTokens(tokenTotal)}
              />
              <StatCard
                footer={t('Derived: sum of share over the ranked rows. Below 100% means the tail was cut.')}
                icon={<TrophyIcon />}
                iconTone="info"
                label={t('Traffic covered')}
                value={formatShare(shareCovered)}
              />
              <StatCard
                footer={t('Derived: ranked rows carrying no previous_rank, so they had no rank in {{baseline}}.', {
                  baseline,
                })}
                icon={<SparklesIcon />}
                iconTone="secondary"
                label={t('New entrants')}
                value={formatNumber(newEntrants)}
              />
            </div>

            <ModelLeaderboard
              baseline={baseline}
              isFetching={rankings.isFetching}
              isLoading={false}
              models={models}
              periodLabel={periodLabel}
            />

            <ModelVolumeChart history={snapshot?.models_history} periodLabel={periodLabel} />

            <VendorLeaderboard
              baseline={baseline}
              isFetching={rankings.isFetching}
              isLoading={false}
              periodLabel={periodLabel}
              vendors={vendors}
            />

            <VendorShareChart history={snapshot?.vendor_share_history} periodLabel={periodLabel} />

            <MoversPanel
              baseline={baseline}
              droppers={snapshot?.top_droppers ?? []}
              movers={snapshot?.top_movers ?? []}
            />
          </>
        ) : null}
      </div>
    </RankingsFrame>
  )
}
