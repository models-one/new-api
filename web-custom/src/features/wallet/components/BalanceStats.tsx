import { useQuery } from '@tanstack/react-query'
import BanknoteIcon from 'lucide-react/dist/esm/icons/banknote'
import ReceiptTextIcon from 'lucide-react/dist/esm/icons/receipt-text'
import WalletCardsIcon from 'lucide-react/dist/esm/icons/wallet-cards'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, Panel, Skeleton, StatCard } from '@/components/ui'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { selfUserQuery } from '@/lib/api/user'
import { formatNumber, quotaToCurrency, splitCurrency } from '@/lib/format'

/** Renders "$501" large with ".89" reduced, the way the console shows money. */
function CurrencyValue(props: { amount: number }) {
  const { whole, fraction } = splitCurrency(props.amount)
  return (
    <>
      {whole}
      <span className="text-2xl font-bold text-muted">{fraction}</span>
    </>
  )
}

/** The three headline figures, all straight from `GET /api/user/self`. */
export function BalanceStats() {
  const { t } = useTranslation()
  const quotaPerUnit = useQuotaPerUnit()
  const selfQuery = useQuery(selfUserQuery())

  if (selfQuery.isError) {
    return (
      <Alert
        action={
          <Button
            aria-busy={selfQuery.isFetching}
            disabled={selfQuery.isFetching}
            onClick={() => void selfQuery.refetch()}
            size="sm"
            variant="outline"
          >
            {t('Try again')}
          </Button>
        }
        title={t('Balance could not be loaded')}
        tone="destructive"
      >
        {toErrorMessage(selfQuery.error)}
      </Alert>
    )
  }

  const user = selfQuery.data

  // StatCard renders `value` inside a <p>, so the loading pass uses its own
  // placeholder panels rather than nesting a block Skeleton in a paragraph.
  if (!user) {
    return (
      <div aria-busy="true" className="grid gap-4 md:grid-cols-3" role="status">
        <span className="sr-only">{t('Loading balance')}</span>
        {[t('Current balance'), t('Total usage'), t('API requests')].map((label) => (
          <Panel as="div" className="flex flex-col p-6" key={label}>
            <p className="eyebrow">{label}</p>
            <Skeleton className="mt-4" height={36} variant="block" width={128} />
            <Skeleton className="mt-5" height={12} variant="block" width={96} />
          </Panel>
        ))}
      </div>
    )
  }

  return (
    <div aria-busy={selfQuery.isFetching} className="grid gap-4 md:grid-cols-3">
      <StatCard
        footer={t('Remaining prepaid quota')}
        icon={<WalletCardsIcon />}
        iconTone="primary"
        label={t('Current balance')}
        value={<CurrencyValue amount={quotaToCurrency(user.quota, quotaPerUnit)} />}
      />
      <StatCard
        footer={t('Lifetime consumption')}
        icon={<BanknoteIcon />}
        iconTone="info"
        label={t('Total usage')}
        value={<CurrencyValue amount={quotaToCurrency(user.used_quota, quotaPerUnit)} />}
      />
      <StatCard
        footer={t('Lifetime requests')}
        icon={<ReceiptTextIcon />}
        iconTone="secondary"
        label={t('API requests')}
        value={formatNumber(user.request_count)}
      />
    </div>
  )
}
