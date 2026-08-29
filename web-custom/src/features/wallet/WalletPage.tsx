import { useQuery } from '@tanstack/react-query'
import TicketIcon from 'lucide-react/dist/esm/icons/ticket'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, PageHeader, Panel, Skeleton } from '@/components/ui'
import { BalanceStats } from '@/features/wallet/components/BalanceStats'
import { RedemptionForm } from '@/features/wallet/components/RedemptionForm'
import { HISTORY_WINDOW_DAYS, TopUpHistory } from '@/features/wallet/components/TopUpHistory'
import { TopUpForm } from '@/features/wallet/components/TopUpForm'
import { topUpInfoQuery } from '@/lib/api/topup'

export function WalletPage() {
  const { t } = useTranslation()
  const infoQuery = useQuery(topUpInfoQuery())
  const info = infoQuery.data

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description={t('Review available quota and add funds to the shared balance.')}
        title={t('Wallet')}
      />

      <BalanceStats />

      <Panel>
        <Panel.Header description={t('Select an amount and payment method.')} title={t('Add funds')} />
        <Panel.Body className="p-6 md:p-8">
          {infoQuery.isPending ? (
            <div aria-busy="true" className="flex flex-col gap-6" role="status">
              <span className="sr-only">{t('Loading payment options')}</span>
              <Skeleton height={96} variant="block" />
              <Skeleton height={56} variant="block" />
            </div>
          ) : null}

          {infoQuery.isError ? (
            <Alert
              action={
                <Button
                  aria-busy={infoQuery.isFetching}
                  disabled={infoQuery.isFetching}
                  onClick={() => void infoQuery.refetch()}
                  size="sm"
                  variant="outline"
                >
                  {t('Try again')}
                </Button>
              }
              title={t('Payment options could not be loaded')}
              tone="destructive"
            >
              {toErrorMessage(infoQuery.error)}
            </Alert>
          ) : null}

          {info ? <TopUpForm info={info} /> : null}
        </Panel.Body>
      </Panel>

      {info?.enable_redemption ? (
        <Panel>
          <Panel.Header
            description={t('Redeeming a code credits your balance immediately.')}
            icon={<TicketIcon aria-hidden="true" className="text-primary" />}
            title={t('Redemption code')}
          />
          <Panel.Body className="p-6 md:p-8">
            <RedemptionForm />
          </Panel.Body>
        </Panel>
      ) : null}

      <Panel>
        <Panel.Header
          description={t('The server only returns orders from the last {{days}} days.', {
            days: HISTORY_WINDOW_DAYS,
          })}
          title={t('Order history')}
        />
        <TopUpHistory />
      </Panel>
    </div>
  )
}
