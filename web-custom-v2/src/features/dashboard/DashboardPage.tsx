import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader, Skeleton, StatusBadge } from '@/components/ui'
import { healthFromSuccessRate, perfSummaryQuery } from '@/lib/api/metrics'
import { ApiKeysPanel } from '@/features/dashboard/components/ApiKeysPanel'
import { ApiVolumePanel } from '@/features/dashboard/components/ApiVolumePanel'
import { BalanceCard } from '@/features/dashboard/components/BalanceCard'
import {
  PERF_WINDOW_HOURS,
  UpstreamProvidersSection,
} from '@/features/dashboard/components/UpstreamProvidersSection'
import { averageSuccessRate, hourWindowEnd } from '@/features/dashboard/estimates'

export function DashboardPage() {
  const { t } = useTranslation()

  /** Pinned once per visit so every panel shares one cache entry per window. */
  const [windowEnd] = useState(hourWindowEnd)

  // Same service-wide query the providers section reads; React Query dedupes it.
  const perf = useQuery(perfSummaryQuery(PERF_WINDOW_HOURS))
  const serviceSuccessRate = averageSuccessRate(perf.data?.models ?? [])

  let serviceStatus: ReactNode = null
  if (perf.isPending) {
    serviceStatus = <Skeleton height={24} variant="block" width={150} />
  } else if (serviceSuccessRate !== null) {
    const health = healthFromSuccessRate(serviceSuccessRate)
    serviceStatus = (
      <StatusBadge tone={health.tone}>
        {t('Service-wide {{status}}', { status: t(health.key) })}
      </StatusBadge>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description={t('Overview of routing infrastructure, balance, and API performance.')}
        status={serviceStatus}
        title={t('Dashboard')}
      />

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <BalanceCard windowEnd={windowEnd} />
        <ApiVolumePanel windowEnd={windowEnd} />
      </div>

      <UpstreamProvidersSection />

      <ApiKeysPanel />
    </div>
  )
}
