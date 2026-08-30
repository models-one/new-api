import { useMutation, useQuery } from '@tanstack/react-query'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NumberInput, RadioGroup, type RadioOption } from '@/components/form'
import { Drawer, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, CopyButton, MaskedValue, Skeleton } from '@/components/ui'
import {
  createRedemptionCodes,
  fetchRedemption,
  updateRedemption,
  type CreateRedemptionResult,
  type RedemptionCode,
} from '@/features/redemption/api'
import {
  currencyToQuota,
  EXPIRY_PRESETS,
  EXPIRY_PRESET_LABEL,
  REDEMPTION_COUNT_MAX,
  REDEMPTION_COUNT_MIN,
  REDEMPTION_NAME_MAX_LENGTH,
  resolveExpiryTimestamp,
  validateRedemptionForm,
  type ExpiryPreset,
  type RedemptionFormErrors,
  type RedemptionFormValues,
} from '@/features/redemption/redemption-presentation'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { formatDateTime, formatNumber, formatQuota } from '@/lib/format'

type RedemptionDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present in edit mode; omitted when the drawer creates a batch. */
  code?: RedemptionCode
  /** Fired whenever the server state changed, so the table can refetch. */
  onChanged: () => void
}

const EMPTY_FORM: RedemptionFormValues = {
  name: '',
  amount: 10,
  expiry: 'never',
  count: 1,
}

/** The batch panel shown after a successful create: the codes, once, together. */
function GeneratedCodes(props: { result: CreateRedemptionResult }) {
  const { t } = useTranslation()
  const { keys, partialError } = props.result
  const allCodes = keys.join('\n')

  return (
    <div className="flex flex-col gap-5">
      <Alert
        icon={<TriangleAlertIcon aria-hidden="true" />}
        title={t('Copy these codes now')}
        tone="warning"
      >
        {t('This batch is only listed here. Once this panel closes the console cannot rebuild the list — individual codes stay revealable one at a time from the table.')}
      </Alert>

      {partialError === undefined ? null : (
        <Alert
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('The server stopped part-way through the batch')}
          tone="destructive"
        >
          {t('Fewer codes were created than requested. The ones below exist and are usable. Server message: {{message}}', {
            message: partialError === '' ? t('none given') : partialError,
          })}
        </Alert>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{t('{{count}} codes created', { count: keys.length })}</p>
        <CopyButton
          label={t('Copy all codes')}
          showLabel
          value={allCodes}
          variant="outline"
        />
      </div>

      <ul className="flex flex-col gap-2">
        {keys.map((key, index) => (
          <li className="flex items-center gap-2" key={key}>
            <span aria-hidden="true" className="mono w-6 shrink-0 text-xs text-muted">
              {index + 1}
            </span>
            <MaskedValue
              className="min-w-0 flex-1"
              copyLabel={t('Copy code {{position}}', { position: index + 1 })}
              copyable
              hideLabel={t('Hide code {{position}}', { position: index + 1 })}
              showLabel={t('Reveal code {{position}}', { position: index + 1 })}
              size="sm"
              value={key}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RedemptionDrawer(props: RedemptionDrawerProps) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const quotaPerUnit = useQuotaPerUnit()
  const isEdit = props.code !== undefined
  const editId = props.code?.id

  const [values, setValues] = useState<RedemptionFormValues>(EMPTY_FORM)
  const [errors, setErrors] = useState<RedemptionFormErrors>({})
  const [created, setCreated] = useState<CreateRedemptionResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  /**
   * Editing re-reads the row rather than trusting the list page, which may be
   * minutes old by the time an admin opens the drawer.
   */
  const currentQuery = useQuery({
    queryKey: ['redemptions', 'detail', editId],
    queryFn: () => fetchRedemption(editId as number),
    enabled: props.open && editId !== undefined,
    staleTime: 0,
    gcTime: 0,
  })
  const current = currentQuery.data

  useEffect(() => {
    if (!props.open) return
    setErrors({})
    setSubmitError(null)
    setCreated(null)
    if (!isEdit) setValues(EMPTY_FORM)
  }, [isEdit, props.open])

  useEffect(() => {
    if (current === undefined) return
    setValues({
      amount: current.quota / quotaPerUnit,
      count: null,
      expiry: 'keep',
      name: current.name,
    })
  }, [current, quotaPerUnit])

  const mutation = useMutation({
    mutationFn: async (form: RedemptionFormValues) => {
      const expiredTime = resolveExpiryTimestamp(form.expiry, new Date(), current?.expired_time ?? 0)
      const draft = {
        expired_time: expiredTime,
        name: form.name.trim(),
        quota: currencyToQuota(form.amount ?? 0, quotaPerUnit),
      }

      if (isEdit && editId !== undefined) {
        await updateRedemption({ ...draft, id: editId })
        return null
      }
      return createRedemptionCodes({ ...draft, count: form.count ?? 1 })
    },
    onSuccess: (result) => {
      props.onChanged()
      if (result === null) {
        toast.success(t('Redemption code updated'))
        props.onOpenChange(false)
        return
      }
      setCreated(result)
    },
    onError: (error: unknown) => setSubmitError(toErrorMessage(error)),
  })

  const handleSubmit = () => {
    setSubmitError(null)
    const nextErrors = validateRedemptionForm(values, { requireCount: !isEdit })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    mutation.mutate(values)
  }

  const describeCurrentExpiry = (): string => {
    if (current === undefined) return t('Loading…')
    if (current.expired_time === 0) return t('Never expires')
    return formatDateTime(current.expired_time, locale)
  }

  const expiryOptions: RadioOption<ExpiryPreset>[] = [
    ...(isEdit
      ? [{
        value: 'keep' as const,
        label: t(EXPIRY_PRESET_LABEL.keep),
        description: describeCurrentExpiry(),
      }]
      : []),
    ...EXPIRY_PRESETS.map((preset) => ({
      value: preset,
      label: t(EXPIRY_PRESET_LABEL[preset]),
      description: preset === 'never'
        ? t('The code stays valid until it is redeemed or disabled.')
        : t('Expires around {{when}}', {
          when: formatDateTime(resolveExpiryTimestamp(preset, new Date()), locale),
        }),
    })),
  ]

  const derivedQuota = currencyToQuota(values.amount ?? 0, quotaPerUnit)
  const title = isEdit ? t('Edit redemption code') : t('Create redemption codes')

  /** Turns a validator error code into the sentence the field shows. */
  const resolveError = (code: string | undefined): string | undefined => {
    if (code === 'name-length') {
      return t('Enter a name of 1 to {{max}} characters.', { max: REDEMPTION_NAME_MAX_LENGTH })
    }
    if (code === 'amount-invalid') return t('Enter an amount of 0 or more.')
    if (code === 'count-range') {
      return t('Enter a whole number between {{min}} and {{max}}.', {
        max: REDEMPTION_COUNT_MAX,
        min: REDEMPTION_COUNT_MIN,
      })
    }
    return undefined
  }

  const describeDrawer = (): string => {
    if (created !== null) return t('The generated codes are listed below.')
    if (isEdit) return t('Name, value and expiry can be changed. The code itself never changes.')
    return t('Every code in the batch carries the same value and expiry.')
  }

  const body = (() => {
    if (created !== null) return <GeneratedCodes result={created} />

    if (isEdit && currentQuery.isPending) {
      return (
        <div aria-busy="true" className="flex flex-col gap-4" role="status">
          <span className="sr-only">{t('Loading the redemption code')}</span>
          <Skeleton height={64} variant="block" />
          <Skeleton height={64} variant="block" />
          <Skeleton height={140} variant="block" />
        </div>
      )
    }

    if (isEdit && currentQuery.isError) {
      return (
        <Alert
          action={
            <Button
              aria-busy={currentQuery.isFetching}
              disabled={currentQuery.isFetching}
              onClick={() => void currentQuery.refetch()}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('Could not load this redemption code')}
          tone="destructive"
        >
          {toErrorMessage(currentQuery.error)}
        </Alert>
      )
    }

    return (
      <form
        className="flex flex-col gap-6"
        id="redemption-drawer-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        {submitError === null ? null : (
          <Alert icon={<TriangleAlertIcon aria-hidden="true" />} title={t('The server rejected this')} tone="destructive">
            {submitError}
          </Alert>
        )}

        <Input
          description={t('Shown in the admin table only. Up to {{max}} characters.', {
            max: REDEMPTION_NAME_MAX_LENGTH,
          })}
          error={resolveError(errors.name)}
          label={t('Batch name')}
          maxLength={REDEMPTION_NAME_MAX_LENGTH}
          onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
          placeholder={t('Launch promo')}
          required
          value={values.name}
        />

        <NumberInput
          description={t('Stored as quota units: amount × QUOTA_PER_UNIT ({{perUnit}}) = {{quota}}. Currently {{money}}.', {
            money: formatQuota(derivedQuota, quotaPerUnit),
            perUnit: formatNumber(quotaPerUnit),
            quota: formatNumber(derivedQuota),
          })}
          error={resolveError(errors.amount)}
          label={t('Value per code')}
          min={0}
          onValueChange={(amount) => setValues((prev) => ({ ...prev, amount }))}
          required
          step={0.01}
          value={values.amount ?? ''}
        />

        <RadioGroup<ExpiryPreset>
          description={t('Evaluated when you save, against this browser clock.')}
          label={t('Expiry')}
          onValueChange={(expiry) => setValues((prev) => ({ ...prev, expiry }))}
          options={expiryOptions}
          value={values.expiry}
          variant="card"
        />

        {isEdit ? null : (
          <NumberInput
            description={t('The server creates between {{min}} and {{max}} codes per request.', {
              max: REDEMPTION_COUNT_MAX,
              min: REDEMPTION_COUNT_MIN,
            })}
            error={resolveError(errors.count)}
            label={t('Number of codes')}
            max={REDEMPTION_COUNT_MAX}
            min={REDEMPTION_COUNT_MIN}
            onValueChange={(count) => setValues((prev) => ({ ...prev, count }))}
            required
            step={1}
            value={values.count ?? ''}
          />
        )}
      </form>
    )
  })()

  const footer = created !== null
    ? (
      <Button onClick={() => props.onOpenChange(false)} variant="primary">
        {t('Done')}
      </Button>
    )
    : (
      <>
        <Button
          disabled={mutation.isPending}
          onClick={() => props.onOpenChange(false)}
          variant="quiet"
        >
          {t('Cancel')}
        </Button>
        <Button
          aria-busy={mutation.isPending}
          disabled={mutation.isPending || (isEdit && current === undefined)}
          form="redemption-drawer-form"
          type="submit"
          variant="primary"
        >
          {isEdit ? t('Save changes') : t('Create codes')}
        </Button>
      </>
    )

  return (
    <Drawer
      description={describeDrawer()}
      footer={footer}
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="lg"
      title={created !== null ? t('Redemption codes created') : title}
    >
      <div className="flex flex-col gap-6">
        {created === null && !isEdit ? (
          <p className="flex items-center gap-2 text-sm leading-6 text-muted">
            <KeyRoundIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
            {t('A redemption code credits the balance of whoever redeems it. Treat it like a bearer token.')}
          </p>
        ) : null}
        {body}
      </div>
    </Drawer>
  )
}
