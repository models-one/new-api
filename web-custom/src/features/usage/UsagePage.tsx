import CreditCardIcon from 'lucide-react/dist/esm/icons/credit-card'
import DownloadIcon from 'lucide-react/dist/esm/icons/download'
import GaugeIcon from 'lucide-react/dist/esm/icons/gauge'
import TrendingUpIcon from 'lucide-react/dist/esm/icons/trending-up'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'

const modelUsage = [
  { name: 'gpt-4-turbo', tokens: '1.2M', cost: '$120.00', share: '28%', tone: 'primary' as const },
  { name: 'claude-3-opus', tokens: '850K', cost: '$85.00', share: '20%', tone: 'secondary' as const },
  { name: 'mixtral-8x7b', tokens: '4.5M', cost: '$45.00', share: '10%', tone: 'muted' as const },
]

const topKeys = [
  { name: 'Production_Main', cost: '$210.50', width: '72%' },
  { name: 'Staging_Env', cost: '$85.20', width: '31%' },
  { name: 'Dev_Local_Testing', cost: '$12.00', width: '8%' },
]

const invoices = [
  { date: 'Oct 01, 2023', id: 'INV-2023-10', amount: '$385.00', statusKey: 'Paid' },
  { date: 'Sep 01, 2023', id: 'INV-2023-09', amount: '$342.20', statusKey: 'Paid' },
  { date: 'Aug 01, 2023', id: 'INV-2023-08', amount: '$298.40', statusKey: 'Paid' },
]

export function UsagePage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader description={t('Monitor API consumption, monthly spend, and billing history.')} title={t('Usage and billing')} />

      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-6">
          <div className="flex items-start justify-between"><p className="eyebrow">{t('Current spend')}</p><GaugeIcon aria-hidden="true" className="size-5 text-primary" /></div>
          <p className="mono mt-4 text-4xl font-bold">$432.50</p>
          <p className="mt-1 text-sm text-muted">{t('$1,000 monthly limit')}</p>
          <div className="mt-6 h-1.5 overflow-hidden bg-surface-high"><div className="h-full w-[43%] bg-primary" /></div>
          <p className="mt-2 text-right text-xs text-muted">43%</p>
        </Panel>
        <Panel className="p-6">
          <div className="flex items-start justify-between"><p className="eyebrow">{t('Projected spend')}</p><TrendingUpIcon aria-hidden="true" className="size-5 text-secondary" /></div>
          <p className="mono mt-4 text-4xl font-bold">$610.00</p>
          <p className="mt-6 text-sm text-primary">{t('Based on current usage velocity')}</p>
        </Panel>
        <Panel className="p-6">
          <div className="flex items-start justify-between"><p className="eyebrow">{t('Payment method')}</p><CreditCardIcon aria-hidden="true" className="size-5 text-info" /></div>
          <p className="mono mt-4 text-lg">•••• •••• •••• 4242</p>
          <p className="mt-1 text-sm text-muted">{t('Expires 12/25')}</p>
          <Button className="mt-5 w-full" variant="quiet">{t('Manage payment')}</Button>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Panel className="p-6">
          <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-bold">{t('Usage by model')}</h2><select aria-label={t('Billing month')} className="field px-3 text-sm" defaultValue="nov"><option value="nov">November 2023</option><option value="oct">October 2023</option></select></div>
          <div className="mt-5 divide-y divide-border border-y border-border">
            {modelUsage.map((model) => <div className="flex items-center justify-between gap-4 py-4" key={model.name}><div className="min-w-0"><p className="mono truncate font-semibold">{model.name}</p><p className="mt-1 text-xs text-muted">{model.tokens} {t('tokens')}</p></div><div className="text-right"><p className="mono font-semibold">{model.cost}</p><Badge className="mt-1" tone={model.tone}>{model.share}</Badge></div></div>)}
          </div>
        </Panel>

        <Panel className="p-6">
          <h2 className="text-lg font-bold">{t('Top API keys')}</h2>
          <div className="mt-6 flex flex-col gap-5">{topKeys.map((key) => <div key={key.name}><div className="mb-2 flex justify-between gap-3 text-xs"><span className="mono truncate">{key.name}</span><span className="text-primary">{key.cost}</span></div><div className="h-1 bg-surface-high"><div className="h-full bg-primary" style={{ width: key.width }} /></div></div>)}</div>
          <Button className="mt-6 w-full" variant="quiet">{t('View all keys')}</Button>
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="text-lg font-bold">{t('Invoice history')}</h2><Button variant="quiet"><DownloadIcon aria-hidden="true" />{t('Download all')}</Button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] border-collapse text-left text-sm"><thead className="bg-surface-high/40 text-xs text-muted"><tr><th className="px-5 py-3">{t('Date')}</th><th className="px-5 py-3">{t('Invoice ID')}</th><th className="px-5 py-3">{t('Amount')}</th><th className="px-5 py-3">{t('Status')}</th><th className="px-5 py-3 text-right">{t('Action')}</th></tr></thead><tbody>{invoices.map((invoice) => <tr className="border-t border-border" key={invoice.id}><td className="px-5 py-4">{invoice.date}</td><td className="mono px-5 py-4 text-muted">{invoice.id}</td><td className="mono px-5 py-4">{invoice.amount}</td><td className="px-5 py-4"><Badge tone="success">{t(invoice.statusKey)}</Badge></td><td className="px-5 py-4 text-right"><Button aria-label={t('Download invoice')} className="size-9 min-h-9 px-0" title={t('Download invoice')} variant="quiet"><DownloadIcon aria-hidden="true" /></Button></td></tr>)}</tbody></table></div>
      </Panel>
    </div>
  )
}
