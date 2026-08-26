import ArrowUpRightIcon from 'lucide-react/dist/esm/icons/arrow-up-right'
import CopyIcon from 'lucide-react/dist/esm/icons/copy'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import WalletCardsIcon from 'lucide-react/dist/esm/icons/wallet-cards'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { cn } from '@/lib/utils'

const providers = [
  { name: 'OpenAI', code: 'OAI', latency: '342ms', statusKey: 'Healthy', tone: 'success' as const },
  { name: 'Anthropic', code: 'ANT', latency: '410ms', statusKey: 'Healthy', tone: 'success' as const },
  { name: 'Gemini', code: 'GEM', latency: '1,204ms', statusKey: 'Degraded', tone: 'warning' as const },
]

const apiKeys = [
  { name: 'Production Main', key: 'sk-prod-...8f9a', environmentKey: 'Production' },
  { name: 'Staging App', key: 'sk-stg-...2b4c', environmentKey: 'Staging' },
]

export function DashboardPage() {
  const { t } = useTranslation()
  const [range, setRange] = useState('7d')

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description={t('Overview of routing infrastructure, balance, and API performance.')}
        status={<span className="inline-flex items-center gap-2 text-sm text-muted"><span className="size-2 bg-success" />{t('System operational')}</span>}
        title={t('Dashboard')}
      />

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Panel className="flex min-h-[350px] flex-col p-6">
          <div className="flex items-start justify-between">
            <span className="grid size-11 place-items-center rounded-[4px] border border-border bg-surface-high text-primary">
              <WalletCardsIcon aria-hidden="true" className="size-5" />
            </span>
            <Badge tone="muted">{t('Prepaid')}</Badge>
          </div>
          <p className="mt-7 text-sm text-muted">{t('Current balance')}</p>
          <p className="mono mt-1 text-5xl font-bold text-foreground">$4,250<span className="text-lg text-muted">.00</span></p>
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-primary"><ArrowUpRightIcon aria-hidden="true" className="size-4" />{t('Estimated runout in 14 days')}</p>
          <Button className="mt-auto w-full" variant="outline">{t('Top up balance')}</Button>
        </Panel>

        <Panel className="min-h-[350px] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">{t('API volume')}</h2>
              <p className="mt-1 text-sm text-muted">{t('Requests and processed tokens')}</p>
            </div>
            <div aria-label={t('Chart range')} className="grid grid-cols-3 gap-1" role="group">
              {['24h', '7d', '30d'].map((item) => (
                <button
                  aria-pressed={range === item}
                  className={cn('min-h-9 border border-border px-3 text-sm text-muted hover:text-foreground', range === item && 'border-primary bg-primary/10 text-primary')}
                  key={item}
                  onClick={() => setRange(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="data-grid relative mt-8 h-52 overflow-hidden border-b border-l border-border">
            <svg aria-label={t('API volume chart')} className="absolute inset-0 size-full" preserveAspectRatio="none" role="img" viewBox="0 0 100 100">
              <path d="M0 80 C17 78 21 83 35 64 S53 37 67 55 S84 54 100 21" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <path d="M0 92 C20 88 27 95 43 77 S60 68 72 76 S88 58 100 47" fill="none" stroke="var(--color-secondary)" strokeDasharray="3 2" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div className="mt-4 flex justify-end gap-5 text-xs text-muted"><span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-primary" />{t('Requests')}</span><span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-secondary" />{t('Tokens')}</span></div>
        </Panel>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-bold">{t('Upstream providers')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {providers.map((provider) => (
            <Panel className="p-5" key={provider.name}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3"><span className="mono grid size-10 place-items-center border border-border bg-background text-xs">{provider.code}</span><span className="font-semibold">{provider.name}</span></div>
                <Badge tone={provider.tone}>{t(provider.statusKey)}</Badge>
              </div>
              <div className="mt-5 flex items-center justify-between text-sm"><span className="text-muted">{t('Average latency')}</span><span className={cn('mono font-semibold', provider.tone === 'warning' ? 'text-warning' : 'text-primary')}>{provider.latency}</span></div>
            </Panel>
          ))}
        </div>
      </section>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-3 text-lg font-bold"><KeyRoundIcon aria-hidden="true" className="size-5 text-primary" />{t('Active API keys')}</h2>
          <Button variant="quiet">{t('Create key')}</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-surface-high/45 text-xs text-muted"><tr><th className="px-5 py-3 font-semibold">{t('Key name')}</th><th className="px-5 py-3 font-semibold">{t('Key preview')}</th><th className="px-5 py-3 font-semibold">{t('Environment')}</th><th className="px-5 py-3 text-right font-semibold">{t('Actions')}</th></tr></thead>
            <tbody>{apiKeys.map((apiKey) => <tr className="border-t border-border" key={apiKey.key}><td className="px-5 py-4 font-medium">{apiKey.name}</td><td className="mono px-5 py-4 text-muted">{apiKey.key}</td><td className="px-5 py-4"><Badge tone={apiKey.environmentKey === 'Production' ? 'primary' : 'muted'}>{t(apiKey.environmentKey)}</Badge></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><Button aria-label={t('Copy key')} className="size-9 min-h-9 px-0" title={t('Copy key')} variant="quiet"><CopyIcon aria-hidden="true" /></Button><Button aria-label={t('Delete key')} className="size-9 min-h-9 px-0" title={t('Delete key')} variant="quiet"><Trash2Icon aria-hidden="true" /></Button></div></td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
