import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import LinkIcon from 'lucide-react/dist/esm/icons/link'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, IconBadge, Panel, Skeleton } from '@/components/ui'
import { ProviderIcon } from '@/features/auth'
import { authProviderDescriptors } from '@/features/auth/oauth-providers'
import { useAuthServerConfig } from '@/features/auth/server-config'
import { EmailBindDialog } from '@/features/profile/components/EmailBindDialog'
import { TelegramBindDialog } from '@/features/profile/components/TelegramBindDialog'
import { WeChatBindDialog } from '@/features/profile/components/WeChatBindDialog'
import { buildIdentityBindings, type IdentityBinding } from '@/features/profile/identity'
import { customOAuthBindingsQuery, unbindCustomOAuth } from '@/features/profile/identity-api'
import { useOAuthBind } from '@/features/profile/use-oauth-bind'
import { selfUserQuery, type SelfUser } from '@/lib/api/user'

type LoginIdentityPanelProps = {
  user: SelfUser
}

type Translate = ReturnType<typeof useTranslation>['t']

/**
 * The line under a provider's name. A linked provider that kept no id worth showing still
 * has to say it is linked, so the subtitle never goes blank.
 */
function describeBinding(row: IdentityBinding, t: Translate): string {
  if (!row.bound) return t('Not linked')
  return row.boundValue.trim() === '' ? t('Linked') : row.boundValue
}

/**
 * Which sign-in methods reach this account.
 *
 * Two sources, because the backend keeps two:
 *   - built-in providers store their id on the user row (`github_id`, `discord_id`,
 *     `oidc_id`, `wechat_id`, `telegram_id`, `linux_do_id`) and the address in `email`;
 *   - administrator-defined providers live in a join table read through
 *     `GET /api/user/oauth/bindings`.
 *
 * Which providers are OFFERED comes from the shared descriptor module, so a provider the
 * operator disabled — or enabled without the client id its flow needs — has no row at all.
 *
 * Unlinking: `router/api-router.go` registers exactly one self-service unbind route,
 * `DELETE /api/user/oauth/bindings/:provider_id`, and it covers custom providers only. The
 * built-in ones can be cleared solely through `DELETE /api/user/:id/bindings/:binding_type`,
 * which sits behind `AdminAuth`. So an "Unlink" button exists only where an endpoint does;
 * a bound built-in gets "Change" instead, which is real — `handleOAuthBind` and `WeChatBind`
 * both overwrite the stored id (they refuse only when the incoming account is already bound
 * to somebody else).
 */
export function LoginIdentityPanel(props: LoginIdentityPanelProps) {
  const { user } = props
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { config, error: configError, isError: configFailed, isPending: configPending, refetch } =
    useAuthServerConfig()

  const descriptors = useMemo(() => authProviderDescriptors(config), [config])
  const hasCustomProviders = config.customOAuthProviders.length > 0

  const bindingsQuery = useQuery({
    ...customOAuthBindingsQuery(),
    enabled: hasCustomProviders,
  })

  const [emailOpen, setEmailOpen] = useState(false)
  const [wechatOpen, setWeChatOpen] = useState(false)
  const [telegramOpen, setTelegramOpen] = useState(false)
  const [unbindTarget, setUnbindTarget] = useState<IdentityBinding | null>(null)

  const refreshAccount = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: selfUserQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: customOAuthBindingsQuery().queryKey }),
    ])
  }

  const oauthBind = useOAuthBind({ onBound: refreshAccount })

  const unbind = useMutation({
    mutationFn: (providerId: number) => unbindCustomOAuth(providerId),
    onError: (failure: unknown) => toast.error(toErrorMessage(failure)),
    onSuccess: async () => {
      setUnbindTarget(null)
      toast.success(t('Sign-in method unlinked'))
      await refreshAccount()
    },
  })

  const rows = useMemo(
    () => buildIdentityBindings({
      config,
      customBindings: bindingsQuery.data ?? [],
      descriptors,
      user,
    }),
    [bindingsQuery.data, config, descriptors, user],
  )

  const startBinding = (row: IdentityBinding) => {
    if (row.start === 'email') {
      setEmailOpen(true)
      return
    }
    if (row.start === 'wechat') {
      setWeChatOpen(true)
      return
    }
    if (row.start === 'telegram') {
      setTelegramOpen(true)
      return
    }
    if (row.descriptor !== undefined) oauthBind.start(row.descriptor)
  }

  return (
    <>
      <Panel>
        <Panel.Header
          description={t('The methods that can sign in to this account.')}
          icon={<IconBadge icon={<LinkIcon />} size="sm" tone="info" />}
          title={t('Sign-in methods')}
        />
        <Panel.Body className="flex flex-col gap-4 p-6">
          {configFailed ? (
            <Alert
              action={
                <Button onClick={refetch} size="sm" variant="outline">
                  {t('Try again')}
                </Button>
              }
              title={t('Sign-in methods could not be loaded')}
              tone="destructive"
            >
              {toErrorMessage(configError)}
            </Alert>
          ) : null}

          {bindingsQuery.isError ? (
            <Alert
              action={
                <Button
                  aria-busy={bindingsQuery.isFetching}
                  disabled={bindingsQuery.isFetching}
                  onClick={() => void bindingsQuery.refetch()}
                  size="sm"
                  variant="outline"
                >
                  {t('Try again')}
                </Button>
              }
              title={t('Custom providers could not be checked')}
              tone="warning"
            >
              {toErrorMessage(bindingsQuery.error)}
            </Alert>
          ) : null}

          {configPending ? (
            <div aria-busy="true" className="flex flex-col gap-3" role="status">
              <span className="sr-only">{t('Loading sign-in methods')}</span>
              {['a', 'b', 'c'].map((key) => (
                <Skeleton height={64} key={key} variant="block" />
              ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row) => {
                const busy = oauthBind.pendingProviderId === row.id
                const canUnbind = row.bound && row.unbindProviderId !== undefined

                return (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-border px-4 py-3"
                    key={row.id}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <IconBadge
                        icon={<ProviderIcon icon={row.icon} />}
                        size="sm"
                        tone={row.bound ? 'success' : 'muted'}
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                          {row.name}
                          {row.bound ? (
                            <Badge size="sm" tone="success">{t('Linked')}</Badge>
                          ) : null}
                        </p>
                        <p className="mono truncate text-xs text-muted">
                          {describeBinding(row, t)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {canUnbind ? (
                        <Button
                          aria-busy={unbind.isPending && unbindTarget?.id === row.id}
                          disabled={unbind.isPending}
                          onClick={() => setUnbindTarget(row)}
                          variant="danger"
                        >
                          {t('Unlink')}
                        </Button>
                      ) : null}
                      <Button
                        aria-busy={busy}
                        disabled={busy}
                        onClick={() => startBinding(row)}
                        variant="outline"
                      >
                        {row.bound ? t('Change') : t('Link')}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {!configPending && descriptors.length === 0 ? (
            <p className="text-sm leading-6 text-muted">
              {t('No external sign-in providers are enabled on this deployment, so email is the only method that can be linked here.')}
            </p>
          ) : null}

          <p className="text-xs leading-5 text-muted">
            {t('Only administrator-defined providers can be unlinked here — the server has no self-service route for the built-in ones, only an administrator route. "Change" replaces the account currently linked to a method instead of removing it.')}
          </p>
        </Panel.Body>
      </Panel>

      <EmailBindDialog
        config={config}
        currentEmail={user.email}
        onOpenChange={setEmailOpen}
        open={emailOpen}
      />
      <WeChatBindDialog
        onOpenChange={setWeChatOpen}
        open={wechatOpen}
        qrCodeUrl={config.wechatQrCodeUrl}
      />
      <TelegramBindDialog
        botName={config.telegramBotName}
        onOpenChange={setTelegramOpen}
        open={telegramOpen}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Unlink')}
        description={t('{{provider}} will no longer be able to sign in to this account. You can link it again later.', {
          provider: unbindTarget?.name ?? '',
        })}
        destructive
        isLoading={unbind.isPending}
        onConfirm={() => {
          const providerId = unbindTarget?.unbindProviderId
          if (providerId === undefined) return
          unbind.mutate(providerId)
        }}
        onOpenChange={(next) => {
          if (unbind.isPending) return
          if (!next) setUnbindTarget(null)
        }}
        open={unbindTarget !== null}
        title={t('Unlink sign-in method')}
      />
    </>
  )
}
