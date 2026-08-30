import { useQuery } from '@tanstack/react-query'
import LockIcon from 'lucide-react/dist/esm/icons/lock'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, Button, PageHeader, Panel, Skeleton } from '@/components/ui'
import { adminPlansQuery, type SubscriptionPlan, type SubscriptionResetResult } from '@/features/subscriptions/api'
import { isConsoleAdmin } from '@/features/subscriptions/admin-access'
import { LoadFailureAlert } from '@/features/subscriptions/components/LoadFailureAlert'
import { PlanDrawer, type PlanEditorTarget } from '@/features/subscriptions/components/PlanDrawer'
import { PlansTable } from '@/features/subscriptions/components/PlansTable'
import { ResetQuotaDialog } from '@/features/subscriptions/components/ResetQuotaDialog'
import { TogglePlanDialog } from '@/features/subscriptions/components/TogglePlanDialog'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { topUpInfoQuery } from '@/lib/api/topup'
import { selfUserQuery } from '@/lib/api/user'
import { formatNumber } from '@/lib/format'

type ResetOutcome = {
  planTitle: string
  result: SubscriptionResetResult
}

/**
 * Subscription plan administration.
 *
 * Every route under `/api/subscription/admin` sits behind `middleware.AdminAuth()`, so
 * the page is useless — and its queries 403 — for anyone below `RoleAdminUser`. The
 * route should carry `requireSubscriptionsAdmin` in `beforeLoad`; this component checks
 * the same role again so a direct render still refuses rather than showing empty panels.
 */
export function SubscriptionsPage() {
  const { t } = useTranslation()
  const panelTitleId = useId()
  const quotaPerUnit = useQuotaPerUnit()

  const self = useQuery(selfUserQuery())
  const isAdmin = self.data !== undefined && isConsoleAdmin(self.data.role)

  const plans = useQuery({ ...adminPlansQuery(), enabled: isAdmin })
  /**
   * `payment_compliance_confirmed` from `GET /api/user/topup/info` — the same flag
   * `controller.requirePaymentCompliance` reads, and the only place it is exposed to a
   * non-root account. While it is false the create, update and enable/disable handlers
   * refuse the request; the bulk reset does not consult it and stays available.
   */
  const compliance = useQuery({ ...topUpInfoQuery(), enabled: isAdmin })
  const mutationsLocked = compliance.data?.payment_compliance_confirmed === false

  const [editorTarget, setEditorTarget] = useState<PlanEditorTarget | null>(null)
  const [togglePlan, setTogglePlan] = useState<SubscriptionPlan | null>(null)
  const [resetPlan, setResetPlan] = useState<SubscriptionPlan | null>(null)
  const [lastReset, setLastReset] = useState<ResetOutcome | null>(null)

  if (self.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height={96} label={t('Loading subscription plans')} variant="block" />
        <Skeleton height={320} variant="block" />
      </div>
    )
  }

  if (self.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader description={t('Plans users can subscribe to.')} title={t('Subscription plans')} />
        <LoadFailureAlert
          error={self.error}
          isRetrying={self.isFetching}
          onRetry={() => void self.refetch()}
        />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader description={t('Plans users can subscribe to.')} title={t('Subscription plans')} />
        <Alert icon={<ShieldAlertIcon />} title={t('Administrator access required')} tone="warning">
          {t('Subscription plans are managed by administrators. This account does not hold that role, so the plan endpoints would refuse every request from here.')}
        </Alert>
      </div>
    )
  }

  const createButton = (
    <Button disabled={mutationsLocked} onClick={() => setEditorTarget({ mode: 'create' })}>
      <PlusIcon aria-hidden="true" />
      {t('New plan')}
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        action={createButton}
        description={t('What a subscriber pays, how long it lasts, and how much quota it grants.')}
        eyebrow={t('Administration')}
        title={t('Subscription plans')}
      />

      {mutationsLocked ? (
        <Alert icon={<LockIcon />} title={t('Plan changes are locked')} tone="warning">
          {t('A root administrator has to accept the payment compliance terms before plans can be created, edited, enabled or disabled. Resetting quota already works.')}
        </Alert>
      ) : null}

      {compliance.isError ? (
        <LoadFailureAlert
          error={compliance.error}
          isRetrying={compliance.isFetching}
          onRetry={() => void compliance.refetch()}
        />
      ) : null}

      {lastReset === null ? null : (
        <Alert
          dismissLabel={t('Dismiss the reset summary')}
          dismissible
          onDismiss={() => setLastReset(null)}
          title={t('Quota reset on “{{title}}”', { title: lastReset.planTitle })}
          tone="success"
        >
          <ul className="mono flex flex-wrap gap-x-6 gap-y-1">
            <li>{t('Matched subscriptions: {{value}}', { value: formatNumber(lastReset.result.matched_count) })}</li>
            <li>{t('Reset subscriptions: {{value}}', { value: formatNumber(lastReset.result.reset_count) })}</li>
            <li>{t('Users affected: {{value}}', { value: formatNumber(lastReset.result.user_count) })}</li>
            <li>
              {lastReset.result.advance_reset_time
                ? t('Next reset date advanced')
                : t('Next reset date unchanged')}
            </li>
          </ul>
        </Alert>
      )}

      <Panel aria-labelledby={panelTitleId} className="overflow-hidden">
        <Panel.Header
          description={plans.data === undefined
            ? undefined
            : t('{{value}} plans configured', { value: formatNumber(plans.data.length) })}
          title={t('Plans')}
          titleId={panelTitleId}
        />

        {plans.isError ? (
          <Panel.Body>
            <LoadFailureAlert
              error={plans.error}
              isRetrying={plans.isFetching}
              onRetry={() => void plans.refetch()}
            />
          </Panel.Body>
        ) : (
          <PlansTable
            emptyAction={mutationsLocked ? undefined : createButton}
            isFetching={plans.isFetching}
            isLoading={plans.isPending}
            mutationsLocked={mutationsLocked}
            onEdit={(plan) => setEditorTarget({ mode: 'edit', plan })}
            onReset={(plan) => setResetPlan(plan)}
            onToggle={(plan) => setTogglePlan(plan)}
            quotaPerUnit={quotaPerUnit}
            records={plans.data}
          />
        )}
      </Panel>

      {editorTarget === null ? null : (
        <PlanDrawer
          onOpenChange={(open) => {
            if (!open) setEditorTarget(null)
          }}
          open
          quotaPerUnit={quotaPerUnit}
          target={editorTarget}
        />
      )}

      {togglePlan === null ? null : (
        <TogglePlanDialog
          onOpenChange={(open) => {
            if (!open) setTogglePlan(null)
          }}
          open
          plan={togglePlan}
        />
      )}

      {resetPlan === null ? null : (
        <ResetQuotaDialog
          onOpenChange={(open) => {
            if (!open) setResetPlan(null)
          }}
          onResult={(result, planTitle) => setLastReset({ planTitle, result })}
          open
          plan={resetPlan}
        />
      )}
    </div>
  )
}
