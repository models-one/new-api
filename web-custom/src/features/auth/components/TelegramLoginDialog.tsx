import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/overlay/Dialog'
import { Spinner } from '@/components/ui/Spinner'

type TelegramLoginDialogProps = {
  open: boolean
  /** `telegram_bot_name` from /api/status. */
  botName: string
  /** True while the authorization is being exchanged for a session. */
  pending: boolean
  onOpenChange: (open: boolean) => void
  /** Receives the raw value Telegram passes to its callback. */
  onAuthorization: (authorization: unknown) => void
}

type WidgetState = 'idle' | 'loading' | 'ready' | 'failed'

let telegramCallbackSequence = 0

/**
 * Hosts Telegram's own login widget.
 *
 * The widget is a third-party script that calls a global function by name, so
 * each mount registers a uniquely named callback and removes it on cleanup.
 */
export function TelegramLoginDialog(props: TelegramLoginDialogProps) {
  const { t } = useTranslation()
  const widgetContainer = useRef<HTMLDivElement | null>(null)
  const authorizationHandler = useRef(props.onAuthorization)
  const [callbackName] = useState(() => {
    telegramCallbackSequence += 1
    return `modelsOneTelegramLogin${telegramCallbackSequence}`
  })
  const [widgetState, setWidgetState] = useState<WidgetState>('idle')

  useEffect(() => {
    authorizationHandler.current = props.onAuthorization
  }, [props.onAuthorization])

  useEffect(() => {
    const container = widgetContainer.current
    const botName = props.botName.trim()
    if (!props.open || container === null || botName === '') return undefined

    setWidgetState('loading')
    const browserWindow = window as unknown as Record<string, unknown>
    browserWindow[callbackName] = (authorization: unknown) => {
      authorizationHandler.current(authorization)
    }

    const script = document.createElement('script')
    script.async = true
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.dataset.telegramLogin = botName
    script.dataset.size = 'large'
    script.dataset.radius = '4'
    script.dataset.onauth = `${callbackName}(user)`

    const handleLoad = () => setWidgetState('ready')
    const handleError = () => setWidgetState('failed')
    script.addEventListener('load', handleLoad)
    script.addEventListener('error', handleError)
    container.replaceChildren(script)

    return () => {
      script.removeEventListener('load', handleLoad)
      script.removeEventListener('error', handleError)
      container.replaceChildren()
      delete browserWindow[callbackName]
    }
  }, [callbackName, props.botName, props.open])

  const busy = widgetState === 'loading' || props.pending

  return (
    <Dialog
      description={t('Authorize with the Telegram widget to continue.')}
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="sm"
      title={t('Telegram sign-in')}
    >
      <div aria-busy={busy} className="flex min-h-16 items-center justify-center">
        {busy ? <Spinner label={t('Loading the Telegram widget')} /> : null}
        {widgetState === 'failed' ? (
          <p className="text-sm text-destructive" role="alert">
            {t('The Telegram login widget could not be loaded.')}
          </p>
        ) : null}
        <div className={widgetState === 'ready' && !props.pending ? 'block' : 'hidden'} ref={widgetContainer} />
      </div>
    </Dialog>
  )
}
