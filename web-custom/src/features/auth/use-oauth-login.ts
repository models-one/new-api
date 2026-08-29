import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toast } from '@/components/overlay/toast'
import { telegramLogin, wechatLoginByCode } from '@/features/auth/api'
import { resetAuthSession, startRedirectOAuth } from '@/features/auth/oauth-flow'
import { authProviderDescriptors, type OAuthProviderDescriptor } from '@/features/auth/oauth-providers'
import { pickTelegramAuthorization } from '@/features/auth/telegram'
import { isAuthBundle } from '@/lib/auth-session'

import type { AuthServerConfig } from '@/features/auth/server-config'
import type { AuthBundle } from '@/features/auth/types'

/** The two providers that hand back an auth bundle in-page instead of redirecting. */
export type OAuthLoginMethod = 'telegram' | 'wechat'

export type UseOAuthLoginOptions = {
  config: AuthServerConfig
  /**
   * Receives the bundle Telegram or WeChat returned. Apply it with
   * `applyAuthBundle` and navigate; this hook deliberately owns no routing.
   */
  onAuthenticated: (bundle: AuthBundle, method: OAuthLoginMethod) => void | Promise<void>
  /**
   * Gate run before any provider starts — legal consent, for instance. Return
   * false to abort; showing the reason is the caller's job.
   */
  canStart?: () => boolean
}

export type TelegramDialogState = {
  open: boolean
  botName: string
  pending: boolean
  setOpen: (open: boolean) => void
  /** Receives the raw widget callback value. */
  submit: (authorization: unknown) => void
}

export type WeChatDialogState = {
  open: boolean
  qrCodeUrl: string
  pending: boolean
  setOpen: (open: boolean) => void
  submit: (code: string) => void
}

export type UseOAuthLoginResult = {
  providers: OAuthProviderDescriptor[]
  /** Id of the provider currently starting, or null. */
  pendingProviderId: string | null
  isPending: boolean
  start: (descriptor: OAuthProviderDescriptor) => void
  telegram: TelegramDialogState
  wechat: WeChatDialogState
}

export function useOAuthLogin(options: UseOAuthLoginOptions): UseOAuthLoginResult {
  const { canStart, config, onAuthenticated } = options
  const { t } = useTranslation()

  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null)
  const [telegramOpen, setTelegramOpen] = useState(false)
  const [telegramPending, setTelegramPending] = useState(false)
  const [wechatOpen, setWeChatOpen] = useState(false)
  const [wechatPending, setWeChatPending] = useState(false)

  const providers = useMemo(() => authProviderDescriptors(config), [config])

  const start = useCallback((descriptor: OAuthProviderDescriptor) => {
    if (canStart && !canStart()) return
    setPendingProviderId(descriptor.id)

    const run = async () => {
      try {
        if (descriptor.kind === 'redirect') {
          // Navigates away on success, so the pending state is never cleared.
          await startRedirectOAuth(descriptor)
          return
        }

        if (descriptor.kind === 'telegram') {
          await resetAuthSession()
          setTelegramOpen(true)
        } else {
          setWeChatOpen(true)
        }
        setPendingProviderId(null)
      } catch {
        setPendingProviderId(null)
        toast.error(
          t('Could not start {{provider}} sign-in. Please try again.', { provider: descriptor.name }),
        )
      }
    }

    void run()
  }, [canStart, t])

  const submitTelegram = useCallback((value: unknown) => {
    const authorization = pickTelegramAuthorization(value)
    if (!authorization) {
      toast.error(t('Sign-in failed. Please try again.'))
      return
    }

    const run = async () => {
      setTelegramPending(true)
      try {
        const response = await telegramLogin(authorization)
        if (!response.success || !isAuthBundle(response.data)) {
          toast.error(response.message || t('Sign-in failed. Please try again.'))
          return
        }
        setTelegramOpen(false)
        await onAuthenticated(response.data, 'telegram')
      } catch (error: unknown) {
        toast.error(error)
      } finally {
        setTelegramPending(false)
      }
    }

    void run()
  }, [onAuthenticated, t])

  const submitWeChat = useCallback((code: string) => {
    const verificationCode = code.trim()
    if (verificationCode === '') return

    const run = async () => {
      setWeChatPending(true)
      try {
        const response = await wechatLoginByCode(verificationCode)
        if (!response.success || !isAuthBundle(response.data)) {
          toast.error(response.message || t('Sign-in failed. Please try again.'))
          return
        }
        setWeChatOpen(false)
        await onAuthenticated(response.data, 'wechat')
      } catch (error: unknown) {
        toast.error(error)
      } finally {
        setWeChatPending(false)
      }
    }

    void run()
  }, [onAuthenticated, t])

  return {
    providers,
    pendingProviderId,
    isPending: pendingProviderId !== null,
    start,
    telegram: {
      open: telegramOpen,
      botName: config.telegramBotName,
      pending: telegramPending,
      setOpen: setTelegramOpen,
      submit: submitTelegram,
    },
    wechat: {
      open: wechatOpen,
      qrCodeUrl: config.wechatQrCodeUrl,
      pending: wechatPending,
      setOpen: setWeChatOpen,
      submit: submitWeChat,
    },
  }
}
