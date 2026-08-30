import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import BellIcon from 'lucide-react/dist/esm/icons/bell'
import MailIcon from 'lucide-react/dist/esm/icons/mail'
import ServerIcon from 'lucide-react/dist/esm/icons/server'
import WebhookIcon from 'lucide-react/dist/esm/icons/webhook'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NumberInput, PasswordInput, RadioGroup, SwitchRow, type RadioOption } from '@/components/form'
import { toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, IconBadge, Panel, Skeleton } from '@/components/ui'
import { saveNotificationPreferences } from '@/features/profile/preferences/api'
import {
  DEFAULT_QUOTA_WARNING_THRESHOLD,
  GOTIFY_PRIORITY_MAX,
  GOTIFY_PRIORITY_MIN,
  buildUserSettingPayload,
  parseUserSetting,
  readNotificationPreferences,
  validateNotificationPreferences,
  type NotificationPreferences,
  type NotifyType,
  type PreferenceValidationErrors,
} from '@/features/profile/preferences/user-settings'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { selfUserQuery } from '@/lib/api/user'
import { formatQuota } from '@/lib/format'

/**
 * `common.RoleAdminUser` (common/constants.go). `controller.UpdateUserSetting`
 * applies `upstream_model_update_notify_enabled` only for `user.Role >= RoleAdminUser`.
 *
 * KIT GAP: `features/subscriptions/admin-access.ts` and `features/redemption/admin-access.ts`
 * each declare this same threshold. It belongs in a shared lib; duplicated here
 * rather than cross-importing another feature's module.
 */
const ADMIN_ROLE_THRESHOLD = 10

const NOTIFY_ICONS: Record<NotifyType, typeof MailIcon> = {
  bark: BellIcon,
  email: MailIcon,
  gotify: ServerIcon,
  webhook: WebhookIcon,
}

/**
 * Where quota warnings go, and the two account-behaviour switches that share the
 * same `setting` column.
 *
 * The method decides which fields exist, and it does so on the SERVER too: the
 * controller copies `bark_url` into the stored settings only while the method is
 * `bark`, so a Bark URL entered under the e-mail method would be discarded. The
 * form therefore shows exactly the fields the chosen method will keep.
 */
export function NotificationPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const quotaPerUnit = useQuotaPerUnit()

  const userQuery = useQuery(selfUserQuery())
  const setting = useMemo(() => parseUserSetting(userQuery.data?.setting), [userQuery.data?.setting])
  const saved = useMemo(() => readNotificationPreferences(setting), [setting])
  const isAdmin = (userQuery.data?.role ?? 0) >= ADMIN_ROLE_THRESHOLD

  const [draft, setDraft] = useState<NotificationPreferences>(saved)
  const [errors, setErrors] = useState<PreferenceValidationErrors>({})
  const [failure, setFailure] = useState<string | null>(null)

  // The server is the source of truth: re-seed whenever it hands us new settings.
  useEffect(() => setDraft(saved), [saved])

  const update = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setFailure(null)
  }

  const save = useMutation({
    mutationFn: (preferences: NotificationPreferences) => saveNotificationPreferences(
      buildUserSettingPayload(preferences, { isAdmin }),
      { language: setting.language, sidebarModules: setting.sidebar_modules },
    ),
    onSuccess: () => {
      toast.success(t('Notification preferences saved'))
      void queryClient.invalidateQueries({ queryKey: ['user', 'self'] })
    },
    onError: (error: unknown) => setFailure(toErrorMessage(error)),
  })

  const methodOptions: RadioOption<NotifyType>[] = [
    { label: t('Email'), value: 'email' },
    { label: t('Webhook'), value: 'webhook' },
    { label: 'Bark', value: 'bark' },
    { label: 'Gotify', value: 'gotify' },
  ].map((option) => {
    const Icon = NOTIFY_ICONS[option.value as NotifyType]
    return { ...option, icon: <Icon aria-hidden="true" /> } as RadioOption<NotifyType>
  })

  const submit = () => {
    const found = validateNotificationPreferences(draft, {
      emailInvalid: t('Enter a valid email address.'),
      thresholdPositive: t('Enter a threshold greater than zero.'),
      tokenRequired: t('This is required for Gotify.'),
      urlInvalid: t('Enter a full http:// or https:// address.'),
      urlRequired: t('This is required for the selected method.'),
    })
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setFailure(null)
    save.mutate(draft)
  }

  return (
    <Panel>
      <Panel.Header
        description={t('Where to reach you when your balance runs low.')}
        icon={<IconBadge icon={<BellIcon aria-hidden="true" />} size="sm" tone="info" />}
        title={t('Notifications')}
      />

      <Panel.Body className="flex flex-col gap-6">
        {userQuery.isPending ? (
          <div aria-busy="true" className="flex flex-col gap-4" role="status">
            <span className="sr-only">{t('Loading notification preferences')}</span>
            <Skeleton height={120} variant="block" />
            <Skeleton height={72} variant="block" />
          </div>
        ) : null}

        {userQuery.isError ? (
          <Alert
            action={(
              <Button
                aria-busy={userQuery.isFetching}
                disabled={userQuery.isFetching}
                onClick={() => void userQuery.refetch()}
                size="sm"
                variant="outline"
              >
                {t('Try again')}
              </Button>
            )}
            title={t('Preferences could not be loaded')}
            tone="destructive"
          >
            {toErrorMessage(userQuery.error)}
          </Alert>
        ) : null}

        {userQuery.data ? (
          <>
            <RadioGroup
              label={t('How to notify you')}
              onValueChange={(value) => update('notifyType', value)}
              options={methodOptions}
              orientation="horizontal"
              value={draft.notifyType}
              variant="card"
            />

            <NumberInput
              description={t(
                'Warn me when the balance drops below this. Stored in quota units; {{quota}} units = {{amount}} at the current rate of {{perUnit}} units per unit of currency.',
                {
                  amount: formatQuota(draft.quotaWarningThreshold, quotaPerUnit),
                  perUnit: quotaPerUnit.toLocaleString('en-US'),
                  quota: draft.quotaWarningThreshold.toLocaleString('en-US'),
                },
              )}
              error={errors.quotaWarningThreshold}
              label={t('Low balance threshold')}
              min={1}
              onValueChange={(value) => update('quotaWarningThreshold', value ?? 0)}
              placeholder={String(DEFAULT_QUOTA_WARNING_THRESHOLD)}
              step={1}
              value={draft.quotaWarningThreshold}
            />

            {draft.notifyType === 'email' ? (
              <Input
                autoComplete="email"
                description={t('Leave this empty to use the email address on your account.')}
                error={errors.notificationEmail}
                label={t('Notification email')}
                onChange={(event) => update('notificationEmail', event.target.value)}
                placeholder="alerts@example.com"
                type="email"
                value={draft.notificationEmail}
              />
            ) : null}

            {draft.notifyType === 'webhook' ? (
              <>
                <Input
                  autoComplete="off"
                  error={errors.webhookUrl}
                  label={t('Webhook URL')}
                  onChange={(event) => update('webhookUrl', event.target.value)}
                  placeholder="https://example.com/hooks/quota"
                  type="url"
                  value={draft.webhookUrl}
                />
                {/*
                  Seeded with the stored secret on purpose. `controller.UpdateUserSetting`
                  builds a fresh dto.UserSetting and only copies the secret across when the
                  request carries a non-empty one, so a save that omits it WIPES the stored
                  value — verified on the dev server. Round-tripping the current value is
                  what keeps an unrelated save from silently unsigning the webhook.
                */}
                <PasswordInput
                  autoComplete="off"
                  description={t('Sent with each request so your endpoint can verify it came from here. Clearing this field removes the stored secret.')}
                  label={t('Webhook secret')}
                  onChange={(event) => update('webhookSecret', event.target.value)}
                  value={draft.webhookSecret}
                />
              </>
            ) : null}

            {draft.notifyType === 'bark' ? (
              <Input
                autoComplete="off"
                description={(
                  <>
                    {/*
                      `service.sendBarkNotify` substitutes these two tokens into the URL
                      verbatim. They are rendered as literal code rather than passed
                      through t(), so no translation can lose or reshape them.
                    */}
                    {t('Your Bark push URL. These placeholders are replaced with the alert:')}
                    {' '}
                    <code className="mono">{'{{title}}'}</code>
                    {', '}
                    <code className="mono">{'{{content}}'}</code>
                  </>
                )}
                error={errors.barkUrl}
                label={t('Bark push URL')}
                onChange={(event) => update('barkUrl', event.target.value)}
                placeholder="https://api.day.app/yourkey"
                type="url"
                value={draft.barkUrl}
              />
            ) : null}

            {draft.notifyType === 'gotify' ? (
              <>
                <Input
                  autoComplete="off"
                  error={errors.gotifyUrl}
                  label={t('Gotify server URL')}
                  onChange={(event) => update('gotifyUrl', event.target.value)}
                  placeholder="https://gotify.example.com"
                  type="url"
                  value={draft.gotifyUrl}
                />
                <PasswordInput
                  autoComplete="off"
                  description={t('The application token from your Gotify server.')}
                  error={errors.gotifyToken}
                  label={t('Gotify application token')}
                  onChange={(event) => update('gotifyToken', event.target.value)}
                  value={draft.gotifyToken}
                />
                <NumberInput
                  description={t('{{min}} is lowest and {{max}} is highest. Anything outside that range is stored as {{fallback}}.', {
                    fallback: 5,
                    max: GOTIFY_PRIORITY_MAX,
                    min: GOTIFY_PRIORITY_MIN,
                  })}
                  label={t('Message priority')}
                  max={GOTIFY_PRIORITY_MAX}
                  min={GOTIFY_PRIORITY_MIN}
                  onValueChange={(value) => update('gotifyPriority', value ?? 0)}
                  step={1}
                  value={draft.gotifyPriority}
                />
              </>
            ) : null}

            <div className="flex flex-col">
              {isAdmin ? (
                <SwitchRow
                  checked={draft.upstreamModelUpdateNotify}
                  description={t('Administrators only. Sends a summary when the scheduled upstream model check finds changes or fails.')}
                  label={t('Upstream model update alerts')}
                  onCheckedChange={(checked) => update('upstreamModelUpdateNotify', checked)}
                />
              ) : null}

              <SwitchRow
                checked={draft.acceptUnpricedModels}
                description={t('Allow requests to models that have no price configured. They may be billed later once a price is set.')}
                label={t('Accept models without a price')}
                onCheckedChange={(checked) => update('acceptUnpricedModels', checked)}
              />

              <SwitchRow
                checked={draft.recordIpLog}
                description={t('Store the calling IP address on your request and error log entries.')}
                label={t('Record IP addresses in my logs')}
                onCheckedChange={(checked) => update('recordIpLog', checked)}
              />
            </div>

            {failure !== null ? (
              <Alert title={t('Preferences were not saved')} tone="destructive">
                {failure}
              </Alert>
            ) : null}
          </>
        ) : null}
      </Panel.Body>

      {userQuery.data ? (
        <Panel.Footer>
          <Button aria-busy={save.isPending} disabled={save.isPending} onClick={submit}>
            {t('Save preferences')}
          </Button>
        </Panel.Footer>
      ) : null}
    </Panel>
  )
}
