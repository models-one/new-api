import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ProviderIcon } from '@/features/auth/components/ProviderIcon'
import { TelegramLoginDialog } from '@/features/auth/components/TelegramLoginDialog'
import { WeChatQrDialog } from '@/features/auth/components/WeChatQrDialog'
import { useOAuthLogin, type OAuthLoginMethod } from '@/features/auth/use-oauth-login'
import { cn } from '@/lib/utils'

import type { AuthServerConfig } from '@/features/auth/server-config'
import type { AuthBundle } from '@/features/auth/types'

type OAuthProvidersProps = {
  config: AuthServerConfig
  /** Receives the bundle Telegram or WeChat returned; apply it and navigate. */
  onAuthenticated: (bundle: AuthBundle, method: OAuthLoginMethod) => void | Promise<void>
  /** Blocks every provider, e.g. while the password form is submitting. */
  disabled?: boolean
  /** Gate run before a provider starts. Return false to abort. */
  canStart?: () => boolean
  /** Hides the "Or continue with" rule when the caller draws its own separator. */
  hideSeparator?: boolean
  className?: string
}

/**
 * The provider block, driven entirely by `/api/status`.
 *
 * The legacy console repeated a near-identical if-block per provider and gave
 * GitHub its own label and timeout. Here every provider is one descriptor and
 * one loading state, and the block disappears when the server enables none.
 */
export function OAuthProviders(props: OAuthProvidersProps) {
  const { t } = useTranslation()
  const oauth = useOAuthLogin({
    canStart: props.canStart,
    config: props.config,
    onAuthenticated: props.onAuthenticated,
  })

  if (oauth.providers.length === 0) return null

  const blocked = props.disabled === true || oauth.isPending

  return (
    <div className={cn('flex flex-col gap-3', props.className)}>
      {props.hideSeparator === true ? null : (
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <span className="eyebrow">{t('Or continue with')}</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
      )}

      <div aria-label={t('Other sign-in options')} className="flex flex-col gap-2" role="group">
        {oauth.providers.map((provider) => {
          const pending = oauth.pendingProviderId === provider.id
          return (
            <Button
              aria-busy={pending}
              className="w-full"
              disabled={blocked}
              key={provider.id}
              onClick={() => oauth.start(provider)}
              variant="outline"
            >
              {pending
                ? <Spinner decorative size="sm" />
                : <ProviderIcon icon={provider.icon} />}
              {t('Continue with {{provider}}', { provider: provider.name })}
            </Button>
          )
        })}
      </div>

      {props.config.telegramOAuthEnabled && props.config.telegramBotName !== '' ? (
        <TelegramLoginDialog
          botName={oauth.telegram.botName}
          onAuthorization={oauth.telegram.submit}
          onOpenChange={oauth.telegram.setOpen}
          open={oauth.telegram.open}
          pending={oauth.telegram.pending}
        />
      ) : null}

      {props.config.wechatLoginEnabled ? (
        <WeChatQrDialog
          disabled={props.disabled}
          onOpenChange={oauth.wechat.setOpen}
          onSubmit={oauth.wechat.submit}
          open={oauth.wechat.open}
          pending={oauth.wechat.pending}
          qrCodeUrl={oauth.wechat.qrCodeUrl}
        />
      ) : null}
    </div>
  )
}
