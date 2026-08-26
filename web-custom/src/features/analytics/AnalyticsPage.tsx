import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import CircleCheckIcon from 'lucide-react/dist/esm/icons/circle-check'
import GaugeIcon from 'lucide-react/dist/esm/icons/gauge'
import InfoIcon from 'lucide-react/dist/esm/icons/info'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { cn } from '@/lib/utils'

const distributions = [
  { name: 'gpt-4-turbo', value: 45, color: 'bg-primary' },
  { name: 'claude-3-opus', value: 30, color: 'bg-secondary' },
  { name: 'llama-3-70b', value: 15, color: 'bg-info' },
  { name: 'mixtral-8x7b', value: 10, color: 'bg-muted' },
]

export function AnalyticsPage() {
  const { t } = useTranslation()
  const [range, setRange] = useState('7d')

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        action={<div aria-label={t('Analytics range')} className="grid grid-cols-3 gap-1" role="group">{['24h', '7d', '30d'].map((item) => <button aria-pressed={range === item} className={cn('min-h-10 border border-border px-4 text-sm text-muted', range === item && 'border-primary bg-primary/10 text-primary')} key={item} onClick={() => setRange(item)} type="button">{item}</button>)}</div>}
        description={t('Inspect traffic quality, latency, errors, and model token distribution.')}
        title={t('Advanced analytics')}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-6"><div className="flex items-start justify-between"><p className="eyebrow">{t('Total requests')}</p><ActivityIcon aria-hidden="true" className="size-5 text-primary" /></div><p className="mono mt-4 text-4xl font-bold">2.4M</p><p className="mt-4 text-sm text-success">+12.5% <span className="text-muted">{t('vs last period')}</span></p></Panel>
        <Panel className="p-6"><div className="flex items-start justify-between"><p className="eyebrow">{t('Average latency')}</p><GaugeIcon aria-hidden="true" className="size-5 text-secondary" /></div><p className="mono mt-4 text-4xl font-bold">142<span className="text-lg text-muted">ms</span></p><p className="mt-4 text-sm text-primary">-4.2% <span className="text-muted">{t('vs last period')}</span></p></Panel>
        <Panel className="p-6"><div className="flex items-start justify-between"><p className="eyebrow">{t('Success rate')}</p><CircleCheckIcon aria-hidden="true" className="size-5 text-success" /></div><p className="mono mt-4 text-4xl font-bold">99.98<span className="text-lg text-muted">%</span></p><p className="mt-4 text-sm text-muted">0.0% {t('vs last period')}</p></Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Panel className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-bold">{t('Latency and error rate')}</h2><div className="flex gap-4 text-xs text-muted"><span className="flex items-center gap-2"><span className="size-2 bg-primary" />{t('Latency')}</span><span className="flex items-center gap-2"><span className="size-2 bg-secondary" />{t('Errors')}</span></div></div>
          <div className="data-grid relative mt-8 h-[340px] border-b border-l border-border">
            <svg aria-label={t('Latency and error chart')} className="absolute inset-0 size-full" preserveAspectRatio="none" role="img" viewBox="0 0 100 100"><path d="M0 78 C13 62 22 79 36 60 S52 35 66 50 S83 51 100 28" fill="none" stroke="var(--color-primary)" strokeWidth="1.7" vectorEffect="non-scaling-stroke" /><path d="M0 92 C18 93 21 82 38 90 S54 96 67 80 S82 95 100 75" fill="none" stroke="var(--color-secondary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>
            <div className="absolute inset-x-3 bottom-2 flex justify-between text-[11px] text-muted"><span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span></div>
          </div>
        </Panel>

        <Panel className="p-6">
          <h2 className="text-lg font-bold">{t('Token usage by model')}</h2>
          <div className="mt-7 flex flex-col gap-5">{distributions.map((model) => <div key={model.name}><div className="mb-2 flex justify-between text-sm"><span className="mono">{model.name}</span><span className="text-muted">{model.value}%</span></div><div className="h-1.5 bg-surface-high"><div className={cn('h-full', model.color)} style={{ width: `${model.value}%` }} /></div></div>)}</div>
          <div className="mt-8 flex gap-3 border-t border-border pt-5 text-sm leading-6 text-muted"><InfoIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" /><p>{t('Route non-critical workloads to lower-cost models when latency targets allow.')}</p></div>
        </Panel>
      </div>
    </div>
  )
}
