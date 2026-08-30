import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NativeSelect, NumberInput, SwitchRow } from '@/components/form'
import type { NativeSelectOption } from '@/components/form'
import { Drawer, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'
import {
  adminGroupsQuery,
  createPlan,
  updatePlan,
  type PlanDurationUnit,
  type PlanResetPeriod,
  type SubscriptionPlan,
} from '@/features/subscriptions/api'
import { EMPTY_PLAN_FORM, formValuesToDraft, planToFormValues, toQuotaUnits } from '@/features/subscriptions/plan-form'
import {
  hasValidationError,
  validatePlanForm,
  type PlanFormValues,
  type PlanValidationErrors,
} from '@/features/subscriptions/plan-format'
import { LoadFailureAlert } from '@/features/subscriptions/components/LoadFailureAlert'
import { formatNumber } from '@/lib/format'

export type PlanEditorTarget =
  | { mode: 'create' }
  | { mode: 'edit'; plan: SubscriptionPlan }

type PlanDrawerProps = {
  target: PlanEditorTarget
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `quota_per_unit` from `/api/status`; the divisor between currency and quota units. */
  quotaPerUnit: number
}

/** `model.SubscriptionPlan.Title` is a varchar(128). */
const MAX_TITLE_LENGTH = 128
/** `model.SubscriptionPlan.Subtitle` is a varchar(255). */
const MAX_SUBTITLE_LENGTH = 255
/** The three product-id columns are varchar(128). */
const MAX_PRODUCT_ID_LENGTH = 128

export function PlanDrawer(props: PlanDrawerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const existing = props.target.mode === 'edit' ? props.target.plan : undefined

  const [values, setValues] = useState<PlanFormValues>(EMPTY_PLAN_FORM)
  const [submitted, setSubmitted] = useState(false)

  const groups = useQuery({ ...adminGroupsQuery(), enabled: props.open })

  // Re-seeds whenever the drawer opens or the edited row changes, so reopening on a
  // different plan never shows the previous plan's values.
  useEffect(() => {
    if (!props.open) return
    setSubmitted(false)
    setValues(existing ? planToFormValues(existing, props.quotaPerUnit) : EMPTY_PLAN_FORM)
  }, [existing, props.open, props.quotaPerUnit])

  const errors: PlanValidationErrors = validatePlanForm(values, t)
  const invalid = hasValidationError(errors)
  const shown = (key: keyof PlanValidationErrors) => (submitted ? errors[key] : undefined)

  const save = useMutation({
    mutationFn: () => {
      const draft = formValuesToDraft(values, props.quotaPerUnit)
      if (existing) return updatePlan(existing.id, draft)
      return createPlan(draft)
    },
    onSuccess: async () => {
      toast.success(existing ? t('Plan updated') : t('Plan created'))
      props.onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: ['subscription', 'admin', 'plans'] })
    },
  })

  const update = <Key extends keyof PlanFormValues>(key: Key, value: PlanFormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = () => {
    setSubmitted(true)
    if (invalid) return
    save.mutate()
  }

  const durationUnitOptions: NativeSelectOption[] = [
    { value: 'year', label: t('Years') },
    { value: 'month', label: t('Months') },
    { value: 'day', label: t('Days') },
    { value: 'hour', label: t('Hours') },
    { value: 'custom', label: t('Custom seconds') },
  ]

  const resetPeriodOptions: NativeSelectOption[] = [
    { value: 'never', label: t('No reset') },
    { value: 'daily', label: t('Daily') },
    { value: 'weekly', label: t('Weekly') },
    { value: 'monthly', label: t('Monthly') },
    { value: 'custom', label: t('Custom seconds') },
  ]

  const groupNames = groups.data ?? []
  const groupOptionsFor = (current: string, noneLabel: string): NativeSelectOption[] => {
    const options: NativeSelectOption[] = [{ value: '', label: noneLabel }]
    for (const name of groupNames) options.push({ value: name, label: name })
    // Keeps an already-stored group selectable while the list is loading or failed,
    // so saving cannot silently clear it.
    if (current !== '' && !groupNames.includes(current)) {
      options.push({ value: current, label: current })
    }
    return options
  }

  const quotaUnits = toQuotaUnits(values.total_amount, props.quotaPerUnit)
  const customDuration = values.duration_unit === 'custom'
  const customReset = values.quota_reset_period === 'custom'

  return (
    <Drawer
      description={existing
        ? t('Changes apply to new purchases. Subscriptions already sold keep the terms they were bought under.')
        : t('A plan is only offered to users once it is enabled.')}
      footer={(
        <>
          <Button disabled={save.isPending} onClick={() => props.onOpenChange(false)} variant="quiet">
            {t('Cancel')}
          </Button>
          <Button
            aria-busy={save.isPending}
            disabled={save.isPending || (submitted && invalid)}
            onClick={handleSubmit}
          >
            {existing ? t('Save plan') : t('Create plan')}
          </Button>
        </>
      )}
      onOpenChange={(nextOpen) => {
        if (save.isPending && !nextOpen) return
        props.onOpenChange(nextOpen)
      }}
      open={props.open}
      size="lg"
      title={existing ? t('Edit plan') : t('New plan')}
    >
      {save.isError ? (
        <Alert className="mb-5" icon={null} title={t('The plan could not be saved.')} tone="destructive">
          {toErrorMessage(save.error)}
        </Alert>
      ) : null}

      {submitted && invalid ? (
        <Alert className="mb-5" title={t('Some fields need attention.')} tone="warning">
          {t('Fix the highlighted fields, then save again.')}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-4">
          <h3 className="eyebrow">{t('Plan basics')}</h3>

          <Input
            autoFocus
            error={shown('title')}
            label={t('Plan title')}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(event) => update('title', event.target.value)}
            placeholder={t('Starter')}
            required
            value={values.title}
          />

          <Input
            label={t('Plan subtitle')}
            maxLength={MAX_SUBTITLE_LENGTH}
            onChange={(event) => update('subtitle', event.target.value)}
            placeholder={t('For light, occasional usage')}
            value={values.subtitle}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput
              description={t('Charged once per purchase. The backend stores every plan in USD.')}
              error={shown('price_amount')}
              label={t('Price')}
              min={0}
              onChange={(event) => update('price_amount', event.target.value)}
              prefix="$"
              step="any"
              value={values.price_amount}
            />

            <NumberInput
              description={t('Stored as {{units}} quota units — amount × quota_per_unit ({{perUnit}}). 0 grants unlimited quota.', {
                perUnit: formatNumber(props.quotaPerUnit),
                units: formatNumber(quotaUnits),
              })}
              error={shown('total_amount')}
              label={t('Plan quota')}
              min={0}
              onChange={(event) => update('total_amount', event.target.value)}
              prefix="$"
              step="any"
              value={values.total_amount}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput
              description={t('Higher sorts first. Plans are listed by priority, then by newest.')}
              label={t('Sort priority')}
              onChange={(event) => update('sort_order', event.target.value)}
              step={1}
              value={values.sort_order}
            />

            <NumberInput
              description={t('0 means a user may buy this plan any number of times.')}
              error={shown('max_purchase_per_user')}
              label={t('Purchase limit per user')}
              min={0}
              onChange={(event) => update('max_purchase_per_user', event.target.value)}
              step={1}
              value={values.max_purchase_per_user}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-5">
          <h3 className="eyebrow">{t('Validity')}</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <NativeSelect
              label={t('Duration unit')}
              onChange={(event) => update('duration_unit', event.target.value as PlanDurationUnit)}
              options={durationUnitOptions}
              value={values.duration_unit}
            />

            {customDuration ? (
              <NumberInput
                description={t('The subscription runs for exactly this many seconds.')}
                error={shown('custom_seconds')}
                label={t('Duration in seconds')}
                min={1}
                onChange={(event) => update('custom_seconds', event.target.value)}
                step={1}
                value={values.custom_seconds}
              />
            ) : (
              <NumberInput
                error={shown('duration_value')}
                label={t('Duration')}
                min={1}
                onChange={(event) => update('duration_value', event.target.value)}
                step={1}
                value={values.duration_value}
              />
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-5">
          <h3 className="eyebrow">{t('Quota reset')}</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <NativeSelect
              description={t('How often the plan quota returns to full during the subscription.')}
              label={t('Reset cycle')}
              onChange={(event) => update('quota_reset_period', event.target.value as PlanResetPeriod)}
              options={resetPeriodOptions}
              value={values.quota_reset_period}
            />

            {customReset ? (
              <NumberInput
                error={shown('quota_reset_custom_seconds')}
                label={t('Reset interval in seconds')}
                min={1}
                onChange={(event) => update('quota_reset_custom_seconds', event.target.value)}
                step={1}
                value={values.quota_reset_custom_seconds}
              />
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-5">
          <h3 className="eyebrow">{t('Group changes')}</h3>

          {groups.isError ? (
            <LoadFailureAlert
              error={groups.error}
              isRetrying={groups.isFetching}
              onRetry={() => void groups.refetch()}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <NativeSelect
              description={t('The group the buyer is moved into. The server rejects a group it does not know.')}
              disabled={groups.isPending}
              label={t('Upgrade group')}
              onChange={(event) => update('upgrade_group', event.target.value)}
              options={groupOptionsFor(values.upgrade_group, t('Keep the current group'))}
              value={values.upgrade_group}
            />

            <NativeSelect
              description={t('Applied when the subscription expires.')}
              disabled={groups.isPending}
              label={t('Downgrade group')}
              onChange={(event) => update('downgrade_group', event.target.value)}
              options={groupOptionsFor(values.downgrade_group, t('Return to the pre-purchase group'))}
              value={values.downgrade_group}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-5">
          <h3 className="eyebrow">{t('Payment channels')}</h3>
          <p className="text-xs leading-5 text-muted">
            {t('Each hosted checkout sells this plan only once its product has been created on that provider and its identifier pasted here.')}
          </p>

          <Input
            label={t('Stripe price ID')}
            maxLength={MAX_PRODUCT_ID_LENGTH}
            onChange={(event) => update('stripe_price_id', event.target.value)}
            placeholder="price_..."
            value={values.stripe_price_id}
          />

          <Input
            label={t('Creem product ID')}
            maxLength={MAX_PRODUCT_ID_LENGTH}
            onChange={(event) => update('creem_product_id', event.target.value)}
            placeholder="prod_..."
            value={values.creem_product_id}
          />

          <Input
            label={t('Waffo Pancake product ID')}
            maxLength={MAX_PRODUCT_ID_LENGTH}
            onChange={(event) => update('waffo_pancake_product_id', event.target.value)}
            placeholder="PROD_..."
            value={values.waffo_pancake_product_id}
          />
        </section>

        <section className="border-t border-border pt-5">
          <h3 className="eyebrow mb-2">{t('Availability')}</h3>

          <SwitchRow
            checked={values.enabled}
            description={t('A disabled plan disappears from the storefront. Subscriptions already sold keep running.')}
            label={t('Offer this plan')}
            onCheckedChange={(checked) => update('enabled', checked)}
          />

          <SwitchRow
            checked={values.allow_balance_pay}
            description={t('Lets a user buy the plan with their prepaid balance instead of a card.')}
            label={t('Allow purchase with balance')}
            onCheckedChange={(checked) => update('allow_balance_pay', checked)}
          />

          <SwitchRow
            checked={values.allow_wallet_overflow}
            description={t('When the plan quota runs out, further usage falls back to the wallet balance.')}
            label={t('Fall back to wallet balance')}
            onCheckedChange={(checked) => update('allow_wallet_overflow', checked)}
          />
        </section>
      </div>
    </Drawer>
  )
}
