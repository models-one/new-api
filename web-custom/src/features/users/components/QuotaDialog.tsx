import { useMutation } from '@tanstack/react-query'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NumberInput, RadioGroup, type RadioOption } from '@/components/form'
import { Dialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, DescriptionList, type DescriptionListItem } from '@/components/ui'
import { adjustUserQuota, QUOTA_MODE, type AdminUser, type QuotaMode } from '@/features/users/api'
import {
  currencyToQuota,
  isQuotaAmountValid,
  previewQuota,
} from '@/features/users/user-presentation'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { formatNumber, formatQuota } from '@/lib/format'

type QuotaDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The row whose balance is being adjusted; null closes the dialog. */
  user: AdminUser | null
  onChanged: () => void
}

const MODES: readonly QuotaMode[] = [QUOTA_MODE.add, QUOTA_MODE.subtract, QUOTA_MODE.override]

const MODE_LABEL: Readonly<Record<QuotaMode, string>> = {
  add: 'Add to the balance',
  subtract: 'Take off the balance',
  override: 'Set the balance outright',
}

/**
 * The balance editor.
 *
 * `PUT /api/user/` cannot move a balance — `model.User.EditWithTx` writes only
 * username, display_name, group and remark. The one path that does is
 * `POST /api/user/manage` with `action: "add_quota"`, which is why this is a
 * separate dialog rather than a field in the edit drawer.
 */
export function QuotaDialog(props: QuotaDialogProps) {
  const { t } = useTranslation()
  const quotaPerUnit = useQuotaPerUnit()

  const [mode, setMode] = useState<QuotaMode>(QUOTA_MODE.add)
  const [amount, setAmount] = useState<number | null>(null)
  const [showError, setShowError] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!props.open) return
    setMode(QUOTA_MODE.add)
    setAmount(null)
    setShowError(false)
    setSubmitError(null)
  }, [props.open])

  const user = props.user
  const deltaQuota = currencyToQuota(Math.abs(amount ?? 0), quotaPerUnit)
  const overrideQuota = currencyToQuota(amount ?? 0, quotaPerUnit)
  const sentQuota = mode === QUOTA_MODE.override ? overrideQuota : deltaQuota
  const isValid = isQuotaAmountValid(amount, mode)

  const mutation = useMutation({
    mutationFn: () => adjustUserQuota(user?.id ?? 0, mode, sentQuota),
    onSuccess: () => {
      toast.success(t('Balance adjusted'))
      props.onChanged()
      props.onOpenChange(false)
    },
    onError: (error: unknown) => setSubmitError(toErrorMessage(error)),
  })

  const handleSubmit = () => {
    setSubmitError(null)
    setShowError(true)
    if (!isValid || user === null) return
    mutation.mutate()
  }

  const modeOptions: RadioOption<QuotaMode>[] = MODES.map((option) => ({
    value: option,
    label: t(MODE_LABEL[option]),
    description: option === QUOTA_MODE.override
      ? t('Replaces the balance, and is the only mode that accepts a negative figure.')
      : t('Must be greater than zero — the server refuses a change of nothing.'),
  }))

  const nextQuota = user === null ? 0 : previewQuota(user.quota, mode, sentQuota)
  const amountError = mode === QUOTA_MODE.override
    ? t('Enter an amount.')
    : t('Enter an amount greater than zero.')

  const summary: DescriptionListItem[] = user === null
    ? []
    : [
      {
        id: 'current',
        term: t('Balance now'),
        description: <span className="mono">{formatQuota(user.quota, quotaPerUnit)}</span>,
      },
      {
        id: 'next',
        term: t('Balance after'),
        description: (
          <span className="mono">{isValid ? formatQuota(nextQuota, quotaPerUnit) : '—'}</span>
        ),
      },
      {
        id: 'units',
        term: t('Sent as quota units'),
        description: <span className="mono">{isValid ? formatNumber(sentQuota) : '—'}</span>,
      },
    ]

  return (
    <Dialog
      description={
        user === null
          ? undefined
          : t('Balance of {{username}} (id {{id}}).', { id: user.id, username: user.username })
      }
      footer={
        <>
          <Button disabled={mutation.isPending} onClick={() => props.onOpenChange(false)} variant="quiet">
            {t('Cancel')}
          </Button>
          <Button
            aria-busy={mutation.isPending}
            disabled={mutation.isPending}
            form="quota-dialog-form"
            type="submit"
            variant="primary"
          >
            {t('Apply adjustment')}
          </Button>
        </>
      }
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="md"
      title={t('Adjust balance')}
    >
      <form
        className="flex flex-col gap-6"
        id="quota-dialog-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        {submitError === null ? null : (
          <Alert
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('The server rejected this')}
            tone="destructive"
          >
            {submitError}
          </Alert>
        )}

        <RadioGroup<QuotaMode>
          label={t('Mode')}
          onValueChange={(next) => {
            setMode(next)
            setShowError(false)
          }}
          options={modeOptions}
          value={mode}
          variant="card"
        />

        <NumberInput
          description={t('Converted to quota units before sending: amount × QUOTA_PER_UNIT ({{perUnit}}). QUOTA_PER_UNIT is quota_per_unit from /api/status.', {
            perUnit: formatNumber(quotaPerUnit),
          })}
          error={showError && !isValid ? amountError : undefined}
          label={t('Amount')}
          onValueChange={(next) => setAmount(next)}
          required
          step={0.01}
          value={amount ?? ''}
        />

        {summary.length > 0 ? (
          <DescriptionList items={summary} label={t('Adjustment summary')} />
        ) : null}
      </form>
    </Dialog>
  )
}
