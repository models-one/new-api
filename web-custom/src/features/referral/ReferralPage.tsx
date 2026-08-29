import ArrowRightLeftIcon from 'lucide-react/dist/esm/icons/arrow-right-left'
import GiftIcon from 'lucide-react/dist/esm/icons/gift'
import LinkIcon from 'lucide-react/dist/esm/icons/link'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import UsersIcon from 'lucide-react/dist/esm/icons/users'
import WalletIcon from 'lucide-react/dist/esm/icons/wallet'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NumberInput } from '@/components/form'
import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { EmptyState } from '@/components/system/EmptyState'
import {
  Alert,
  Button,
  CopyButton,
  DescriptionList,
  PageHeader,
  Panel,
  Skeleton,
  StatCard,
  type DescriptionListItem,
} from '@/components/ui'
import {
  MINIMUM_TRANSFER_UNITS,
  buildInvitationLink,
  currencyToQuota,
  transferAffQuota,
} from '@/features/referral/api'
import { useQuotaPerUnit, useServerStatus } from '@/hooks/use-server-status'
import { topUpInfoQuery } from '@/lib/api/topup'
import { affCodeQuery, selfUserQuery } from '@/lib/api/user'
import { formatNumber, formatQuota, quotaToCurrency } from '@/lib/format'

export function ReferralPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const selfQuery = useQuery(selfUserQuery())
  const affQuery = useQuery(affCodeQuery())
  const statusQuery = useServerStatus()
  // `payment_compliance_confirmed` is the very flag the aff_transfer route checks server-side
  // (controller/payment_compliance.go), so it tells the form up front whether a transfer can
  // succeed at all on this deployment.
  const topUpQuery = useQuery(topUpInfoQuery())
  const quotaPerUnit = useQuotaPerUnit()

  const [amount, setAmount] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const summaryHeadingId = useId()

  const user = selfQuery.data
  const affQuota = user?.aff_quota ?? 0
  /** Server minimum: one full currency unit, i.e. `quota_per_unit` quota. */
  const minimumQuota = quotaPerUnit * MINIMUM_TRANSFER_UNITS

  const transferMutation = useMutation({
    mutationFn: (quota: number) => transferAffQuota(quota),
    onSuccess: async () => {
      setConfirmOpen(false)
      setAmount('')
      toast.success(t('Referral balance moved to your main balance.'))
      await queryClient.invalidateQueries({ queryKey: selfUserQuery().queryKey })
    },
    // Close the modal so the inline error under the form is the thing the user reads.
    onError: () => setConfirmOpen(false),
  })

  // The quota divisor is only trustworthy once /api/status answered, so every money value on
  // this page waits for both queries rather than rendering a number from a fallback divisor.
  const summaryPending = selfQuery.isPending || statusQuery.isPending
  const summaryFailed = selfQuery.isError || statusQuery.isError
  const summaryFetching = selfQuery.isFetching || statusQuery.isFetching

  const typedAmount = amount.trim() === '' ? null : Number(amount)
  const amountValue = typedAmount !== null && Number.isFinite(typedAmount) ? typedAmount : null
  /** What the user asked for, before clamping — used for validation messages. */
  const rawQuota = amountValue === null ? 0 : Math.round(amountValue * quotaPerUnit)
  const requestedQuota =
    amountValue === null ? 0 : currencyToQuota(amountValue, quotaPerUnit, affQuota)

  /**
   * The available balance is shown rounded to two decimals, so typing exactly the figure on
   * screen can land a fraction of a cent above the real balance. Anything inside half a
   * displayed cent is that rounding artefact rather than an overdraw — and `currencyToQuota`
   * clamps the request to the real balance before it is sent.
   */
  const ROUNDING_TOLERANCE_QUOTA = quotaPerUnit * 0.005

  const amountError = (() => {
    if (amountValue === null) return undefined
    if (rawQuota < minimumQuota) {
      return t('The minimum transfer is {{amount}}.', {
        amount: formatQuota(minimumQuota, quotaPerUnit),
      })
    }
    if (rawQuota > affQuota + ROUNDING_TOLERANCE_QUOTA) {
      return t('That is more than your available referral balance.')
    }
    return undefined
  })()

  const compliancePending = topUpQuery.isPending
  const transfersDisabled = topUpQuery.data?.payment_compliance_confirmed === false
  const hasTransferableBalance = affQuota >= minimumQuota
  const transferPending = summaryPending || compliancePending
  const formDisabled = transfersDisabled || !hasTransferableBalance || transferMutation.isPending
  const canSubmit = amountValue !== null && amountError === undefined && !formDisabled

  const hasReferralActivity =
    (user?.aff_count ?? 0) > 0 || affQuota > 0 || (user?.aff_history_quota ?? 0) > 0

  const linkPending = affQuery.isPending || statusQuery.isPending
  // Both the code and the deployment address are needed before a link can be shown; a failed
  // /api/status must not be presented as "this deployment has no address configured".
  const linkFailed = affQuery.isError || statusQuery.isError
  const invitationLink = buildInvitationLink(
    statusQuery.data?.server_address,
    affQuery.data ?? '',
    typeof window === 'undefined' ? '' : window.location.origin,
  )
  const usesBrowsingOrigin =
    statusQuery.isSuccess && (statusQuery.data.server_address ?? '').trim() === ''

  const identityItems: DescriptionListItem[] = [
    {
      id: 'code',
      term: t('Invitation code'),
      description: (
        <span className="inline-flex items-center gap-2">
          <span className="mono">{affQuery.data}</span>
          <CopyButton label={t('Copy invitation code')} size="icon-sm" value={affQuery.data ?? ''} />
        </span>
      ),
    },
  ]
  if (user && user.inviter_id > 0) {
    identityItems.push({
      id: 'inviter',
      term: t('Invited by'),
      description: <span className="mono">{t('Account #{{id}}', { id: user.inviter_id })}</span>,
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description={t('Invite people with your link and move the rewards they earn you into your main balance.')}
        title={t('Referrals')}
      />

      <section aria-busy={summaryFetching} aria-labelledby={summaryHeadingId}>
        <h2 className="sr-only" id={summaryHeadingId}>{t('Referral summary')}</h2>

        {summaryFailed ? (
          <Alert
            action={(
              <Button
                aria-busy={summaryFetching}
                disabled={summaryFetching}
                onClick={() => {
                  void selfQuery.refetch()
                  void statusQuery.refetch()
                }}
                variant="outline"
              >
                {t('Try again')}
              </Button>
            )}
            icon={<TriangleAlertIcon />}
            title={t('Unable to load your referral summary.')}
            tone="destructive"
          >
            {toErrorMessage(selfQuery.error ?? statusQuery.error)}
          </Alert>
        ) : null}

        {!summaryFailed && summaryPending ? (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {['invited', 'available', 'lifetime'].map((key, index) => (
              <Panel className="flex flex-col gap-4 p-6" key={key}>
                <Skeleton
                  label={index === 0 ? t('Loading referral summary') : undefined}
                  width="45%"
                />
                <Skeleton height={36} variant="block" width="65%" />
              </Panel>
            ))}
          </div>
        ) : null}

        {!summaryFailed && !summaryPending ? (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              icon={<UsersIcon />}
              label={t('People invited')}
              value={formatNumber(user?.aff_count ?? 0)}
            />
            <StatCard
              icon={<GiftIcon />}
              iconTone="secondary"
              label={t('Referral balance available')}
              value={formatQuota(affQuota, quotaPerUnit)}
            />
            <StatCard
              icon={<WalletIcon />}
              iconTone="success"
              label={t('Lifetime referral earnings')}
              value={formatQuota(user?.aff_history_quota ?? 0, quotaPerUnit)}
            />
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel aria-busy={affQuery.isFetching} className="min-w-0 overflow-hidden">
          <Panel.Header
            description={t('Anyone who signs up through this link is recorded as your referral.')}
            icon={<LinkIcon aria-hidden="true" className="text-primary" />}
            title={t('Your invitation link')}
          />
          <Panel.Body className="flex flex-col gap-5">
            {affQuery.isError ? (
              <Alert
                action={(
                  <Button
                    aria-busy={affQuery.isFetching}
                    disabled={affQuery.isFetching}
                    onClick={() => void affQuery.refetch()}
                    variant="outline"
                  >
                    {t('Try again')}
                  </Button>
                )}
                icon={<TriangleAlertIcon />}
                title={t('Unable to load your invitation code.')}
                tone="destructive"
              >
                {toErrorMessage(affQuery.error)}
              </Alert>
            ) : null}

            {!affQuery.isError && statusQuery.isError ? (
              <Alert
                action={(
                  <Button
                    aria-busy={statusQuery.isFetching}
                    disabled={statusQuery.isFetching}
                    onClick={() => void statusQuery.refetch()}
                    variant="outline"
                  >
                    {t('Try again')}
                  </Button>
                )}
                icon={<TriangleAlertIcon />}
                title={t('Unable to load the address your invitation link is built from.')}
                tone="destructive"
              >
                {toErrorMessage(statusQuery.error)}
              </Alert>
            ) : null}

            {!linkFailed && linkPending ? (
              <Skeleton height={40} label={t('Loading invitation link')} variant="block" />
            ) : null}

            {!linkFailed && !linkPending ? (
              <>
                <div className="field flex items-center gap-3 px-3 py-2">
                  <LinkIcon aria-hidden="true" className="size-4 shrink-0 text-muted" />
                  <span className="mono min-w-0 flex-1 truncate text-sm">{invitationLink}</span>
                  <CopyButton label={t('Copy invitation link')} value={invitationLink} />
                </div>
                {usesBrowsingOrigin ? (
                  <p className="text-xs leading-5 text-muted">
                    {t('This deployment has no public address configured, so the link uses the address you are browsing from.')}
                  </p>
                ) : null}
                <DescriptionList items={identityItems} label={t('Referral identity')} />
              </>
            ) : null}
          </Panel.Body>
        </Panel>

        {summaryFailed ? null : (
          <Panel aria-busy={transferPending} className="min-w-0 overflow-hidden">
            <Panel.Header
              description={t('Move referral rewards into the main balance you spend on API requests.')}
              icon={<ArrowRightLeftIcon aria-hidden="true" className="text-secondary" />}
              title={t('Transfer referral balance')}
            />
            <Panel.Body className="flex flex-col gap-5">
              {transferPending ? (
                <Skeleton height={96} label={t('Loading transfer options')} variant="block" />
              ) : null}

              {!transferPending && topUpQuery.isError ? (
                <Alert
                  icon={<TriangleAlertIcon />}
                  title={t('Could not check whether transfers are enabled.')}
                  tone="warning"
                >
                  {toErrorMessage(topUpQuery.error)}
                </Alert>
              ) : null}

              {!transferPending && transfersDisabled ? (
                <Alert title={t('Transfers are turned off')} tone="info">
                  {t('An administrator has not confirmed the payment compliance terms for this deployment, so invitation reward transfers are disabled.')}
                </Alert>
              ) : null}

              {!transferPending && transferMutation.isError ? (
                <Alert
                  icon={<TriangleAlertIcon />}
                  title={t('The transfer did not go through.')}
                  tone="destructive"
                >
                  {toErrorMessage(transferMutation.error)}
                </Alert>
              ) : null}

              {!transferPending && !hasTransferableBalance ? (
                <p className="text-sm leading-6 text-muted">
                  {t('You need at least {{amount}} of referral balance before you can transfer.', {
                    amount: formatQuota(minimumQuota, quotaPerUnit),
                  })}
                </p>
              ) : null}

              {!transferPending ? (
                <form
                  className="flex flex-col gap-5"
                  // The min/max/step attributes below stay for the spinner and screen readers,
                  // but native constraint validation on a fractional currency step is
                  // floating-point fragile and would block submission with no message. The
                  // checks in `amountError` mirror the server rules and are authoritative.
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (canSubmit) setConfirmOpen(true)
                  }}
                >
                  <NumberInput
                    description={t('Minimum {{minimum}}. Available {{available}}.', {
                      available: formatQuota(affQuota, quotaPerUnit),
                      minimum: formatQuota(minimumQuota, quotaPerUnit),
                    })}
                    disabled={formDisabled}
                    error={amountError}
                    label={t('Amount to transfer')}
                    max={quotaToCurrency(affQuota, quotaPerUnit)}
                    min={quotaToCurrency(minimumQuota, quotaPerUnit)}
                    onChange={(event) => setAmount(event.target.value)}
                    prefix="$"
                    step={0.01}
                    value={amount}
                  />
                  <Button
                    aria-busy={transferMutation.isPending}
                    className="w-full"
                    disabled={!canSubmit}
                    type="submit"
                  >
                    <ArrowRightLeftIcon aria-hidden="true" />
                    {t('Transfer to main balance')}
                  </Button>
                </form>
              ) : null}
            </Panel.Body>
          </Panel>
        )}
      </div>

      {!summaryPending && !summaryFailed && !hasReferralActivity ? (
        <Panel className="overflow-hidden">
          <EmptyState
            description={t('Share your invitation link. As soon as somebody signs up with it, their reward appears here.')}
            title={t('No referrals yet')}
          />
        </Panel>
      ) : null}

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Transfer')}
        description={t('This moves {{amount}} from your referral balance to your main balance. It cannot be undone.', {
          amount: formatQuota(requestedQuota, quotaPerUnit),
        })}
        isLoading={transferMutation.isPending}
        onConfirm={() => transferMutation.mutate(requestedQuota)}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title={t('Transfer referral balance?')}
      />
    </div>
  )
}
