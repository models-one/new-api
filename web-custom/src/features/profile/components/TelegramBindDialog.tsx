import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, Skeleton } from '@/components/ui'
import { TELEGRAM_BIND_RESULT_MESSAGE } from '@/features/auth/callback/bind-window'
import { startTelegramBind } from '@/features/profile/identity-api'
import { selfUserQuery } from '@/lib/api/user'

type TelegramBindDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `telegram_bot_name` from `GET /api/status`. */
  botName: string
}

const WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Telegram is the one binding the backend completes on its own.
 *
 * `POST /api/oauth/telegram/bind/start` mints a flow token and answers with
 * `callback_url = /api/oauth/telegram/bind/<token>`. That URL is handed to Telegram's login
 * widget as `data-auth-url`; the widget authorizes in a popup and redirects THAT popup to
 * the callback, where `controller.TelegramBind` performs the bind and redirects to
 * `/oauth/telegram?telegram_bind=success|error&flow_token=…`. The callback page posts the
 * verdict to its opener as `TELEGRAM_BIND_RESULT_MESSAGE`, which is what this dialog waits
 * for — there is no second request to make from here.
 *
 * Telegram is disabled on the dev server; every step above is read from
 * `controller/telegram.go` and from the already-built callback page.
 */
export function TelegramBindDialog(props: TelegramBindDialogProps) {
  const { botName, onOpenChange, open } = props
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const widgetRef = useRef<HTMLDivElement>(null)
  const [flowToken, setFlowToken] = useState('')
  const [callbackUrl, setCallbackUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const startFlow = useMutation({
    mutationFn: startTelegramBind,
    onError: (failure: unknown) => setError(toErrorMessage(failure)),
    onSuccess: (flow) => {
      setError(null)
      setFlowToken(flow.flow_token)
      setCallbackUrl(new URL(flow.callback_url, window.location.origin).toString())
    },
  })

  const startFlowRef = useRef(startFlow.mutate)
  useEffect(() => {
    startFlowRef.current = startFlow.mutate
  })

  useEffect(() => {
    if (!open) {
      setFlowToken('')
      setCallbackUrl('')
      setError(null)
      return
    }
    startFlowRef.current()
  }, [open])

  useEffect(() => {
    if (!open || flowToken === '') return undefined

    const handleResult = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return
      const payload = event.data
      if (!isRecord(payload)) return
      if (payload.type !== TELEGRAM_BIND_RESULT_MESSAGE) return
      if (payload.flow_token !== flowToken) return

      if (payload.success !== true) {
        const code = typeof payload.code === 'string' && payload.code !== '' ? payload.code : null
        setError(
          code === null
            ? t('Telegram could not be linked. Please try again.')
            : t('Telegram could not be linked ({{code}}). Please try again.', { code }),
        )
        return
      }

      toast.success(t('Telegram is now linked to your account.'))
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: selfUserQuery().queryKey })
    }

    window.addEventListener('message', handleResult)
    return () => window.removeEventListener('message', handleResult)
  }, [flowToken, onOpenChange, open, queryClient, t])

  useEffect(() => {
    const container = widgetRef.current
    if (container === null || callbackUrl === '') return undefined

    container.replaceChildren()
    const script = document.createElement('script')
    script.async = true
    script.src = WIDGET_SRC
    script.setAttribute('data-telegram-login', botName.replace(/^@/, ''))
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-auth-url', callbackUrl)
    script.setAttribute('data-request-access', 'write')
    container.appendChild(script)

    return () => container.replaceChildren()
  }, [botName, callbackUrl])

  return (
    <Dialog
      description={t('Authorize @{{bot}} in Telegram. The link is confirmed here automatically.', {
        bot: botName.replace(/^@/, ''),
      })}
      footer={
        <Button onClick={() => onOpenChange(false)} variant="quiet">
          {t('Close')}
        </Button>
      }
      onOpenChange={onOpenChange}
      open={open}
      scrollBody={false}
      size="sm"
      title={t('Link Telegram')}
    >
      <div className="flex flex-col gap-4">
        {error === null ? null : (
          <Alert
            action={
              <Button
                aria-busy={startFlow.isPending}
                disabled={startFlow.isPending}
                onClick={() => startFlow.mutate()}
                size="sm"
                variant="outline"
              >
                {t('Try again')}
              </Button>
            }
            tone="destructive"
          >
            {error}
          </Alert>
        )}

        <div className="flex min-h-24 flex-col items-center justify-center gap-3 rounded-[4px] border border-border p-6">
          {startFlow.isPending ? (
            <Skeleton height={40} label={t('Preparing the Telegram button')} variant="block" width={208} />
          ) : null}
          <div className="flex min-h-10 justify-center" ref={widgetRef} />
        </div>

        <p className="text-xs leading-5 text-muted">
          {t('The button above is loaded from telegram.org. If it does not appear, your browser may be blocking third-party scripts.')}
        </p>
      </div>
    </Dialog>
  )
}
