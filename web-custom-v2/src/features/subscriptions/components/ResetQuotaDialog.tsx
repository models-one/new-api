import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Switch } from '@/components/form'
import { ConfirmDialog, toErrorMessage } from '@/components/overlay'
import { Alert } from '@/components/ui'
import {
  resetPlanSubscriptions,
  type SubscriptionPlan,
  type SubscriptionResetResult,
} from '@/features/subscriptions/api'

type ResetQuotaDialogProps = {
  plan: SubscriptionPlan
  open: boolean
  onOpenChange: (open: boolean) => void
  onResult: (result: SubscriptionResetResult, planTitle: string) => void
}

/**
 * The bulk reset. It rewrites every ACTIVE, unexpired subscription of the plan — the
 * server selects on `plan_id = ? AND status = 'active' AND end_time > now` — so the
 * blast radius is every current subscriber, not a single account.
 *
 * The console cannot show that number before the fact: the admin API lists user
 * subscriptions per user (`/api/subscription/admin/users/:id/subscriptions`) and exposes
 * no per-plan count or listing. Rather than invent one, the dialog says so, gates the
 * action behind typing the plan title, and reports the counts the endpoint returns.
 */
export function ResetQuotaDialog(props: ResetQuotaDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [advanceResetTime, setAdvanceResetTime] = useState(true)

  useEffect(() => {
    if (props.open) setAdvanceResetTime(true)
  }, [props.open])

  const reset = useMutation({
    mutationFn: () => resetPlanSubscriptions(props.plan.id, advanceResetTime),
    onSuccess: async (result) => {
      props.onResult(result, props.plan.title)
      props.onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: ['subscription', 'admin', 'plans'] })
    },
  })

  return (
    <ConfirmDialog
      cancelLabel={t('Cancel')}
      confirmLabel={t('Reset quota')}
      confirmPhrase={props.plan.title}
      confirmPhraseLabel={t('Type the plan title “{{title}}” to confirm', { title: props.plan.title })}
      description={t('Every active subscription on this plan has its used quota set back to zero. Consumption already billed is not refunded, and the change cannot be undone.')}
      destructive
      isLoading={reset.isPending}
      onConfirm={() => reset.mutate()}
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="md"
      title={t('Reset quota on {{title}}', { title: props.plan.title })}
    >
      <div className="flex flex-col gap-4">
        <Alert tone="warning">
          {t('This console cannot count the affected subscriptions beforehand: the admin API lists subscriptions per user, never per plan. The matched, reset and user counts are reported once the reset has run.')}
        </Alert>

        <Switch
          checked={advanceResetTime}
          description={t('On: each subscription also moves to its next reset date. Off: only the used quota is cleared and the existing reset date stands.')}
          label={t('Advance the next reset date')}
          onCheckedChange={setAdvanceResetTime}
        />

        {reset.isError ? (
          <Alert title={t('The reset did not run.')} tone="destructive">
            {toErrorMessage(reset.error)}
          </Alert>
        ) : null}
      </div>
    </ConfirmDialog>
  )
}
