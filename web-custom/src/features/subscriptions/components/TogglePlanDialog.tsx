import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert } from '@/components/ui'
import { planToDraft, updatePlan, type SubscriptionPlan } from '@/features/subscriptions/api'

type TogglePlanDialogProps = {
  plan: SubscriptionPlan
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Enable / disable, written through `PUT …/plans/:id` with the stored row and one flag
 * flipped. The dedicated `PATCH …/plans/:id` would need a `patchJson` the shared client
 * does not have; the PUT handler writes `enabled` from the same body, so the two are
 * equivalent as long as every other column is sent back unchanged — which `planToDraft`
 * guarantees.
 */
export function TogglePlanDialog(props: TogglePlanDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const enabling = !props.plan.enabled

  const toggle = useMutation({
    mutationFn: () => updatePlan(props.plan.id, { ...planToDraft(props.plan), enabled: enabling }),
    onSuccess: async () => {
      toast.success(enabling ? t('Plan enabled') : t('Plan disabled'))
      props.onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: ['subscription', 'admin', 'plans'] })
    },
  })

  return (
    <ConfirmDialog
      cancelLabel={t('Cancel')}
      confirmLabel={enabling ? t('Enable plan') : t('Disable plan')}
      description={enabling
        ? t('“{{title}}” becomes visible to users and can be purchased again.', { title: props.plan.title })
        : t('“{{title}}” is withdrawn from the storefront. Subscriptions already sold keep running until they expire.', { title: props.plan.title })}
      destructive={!enabling}
      isLoading={toggle.isPending}
      onConfirm={() => toggle.mutate()}
      onOpenChange={props.onOpenChange}
      open={props.open}
      title={enabling ? t('Enable plan') : t('Disable plan')}
    >
      {toggle.isError ? (
        <Alert title={t('The plan could not be updated.')} tone="destructive">
          {toErrorMessage(toggle.error)}
        </Alert>
      ) : null}
    </ConfirmDialog>
  )
}
