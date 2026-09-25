import { useEffect, useRef } from 'react'

type TurnstileTheme = 'auto' | 'light' | 'dark'

type TurnstileRenderOptions = {
  sitekey: string
  theme: TurnstileTheme
  callback: (token: string) => void
  'error-callback': () => void
  'expired-callback': () => void
  'timeout-callback': () => void
}

type TurnstileApi = {
  render: (element: HTMLElement, options: TurnstileRenderOptions) => string | undefined
  remove: (widgetId: string) => void
  reset: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

type TurnstileProps = {
  /** Cloudflare Turnstile site key. An empty key renders nothing and skips the script. */
  siteKey: string
  onVerify: (token: string) => void
  /** Fired when the token expires, times out, or the challenge errors. */
  onExpire?: () => void
  theme?: TurnstileTheme
  /**
   * Change to force a fresh widget. A Turnstile token is single use: once a
   * send-code request consumes it the widget has to be rendered again.
   */
  refreshKey?: number | string
  className?: string
}

const SCRIPT_ID = 'cf-turnstile-script'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile !== undefined) return Promise.resolve()
  if (scriptPromise !== null) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const failed = () => {
      scriptPromise = null
      reject(new Error('Turnstile script failed to load'))
    }

    const existing = document.getElementById(SCRIPT_ID)
    if (existing !== null) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', failed, { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', failed, { once: true })
    document.head.appendChild(script)
  })

  return scriptPromise
}

export function Turnstile(props: TurnstileProps) {
  const { className, refreshKey, siteKey, theme = 'dark' } = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onVerifyRef = useRef(props.onVerify)
  const onExpireRef = useRef(props.onExpire)

  useEffect(() => {
    onVerifyRef.current = props.onVerify
    onExpireRef.current = props.onExpire
  })

  useEffect(() => {
    if (siteKey === '') return undefined

    let widgetId: string | undefined
    let cancelled = false

    void loadTurnstileScript()
      .then(() => {
        const container = containerRef.current
        const api = window.turnstile
        if (cancelled || container === null || api === undefined) return
        container.replaceChildren()
        try {
          widgetId = api.render(container, {
            sitekey: siteKey,
            theme,
            callback: (token) => onVerifyRef.current(token),
            'error-callback': () => onExpireRef.current?.(),
            'expired-callback': () => onExpireRef.current?.(),
            'timeout-callback': () => onExpireRef.current?.(),
          })
        } catch {
          widgetId = undefined
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      if (widgetId !== undefined) window.turnstile?.remove(widgetId)
    }
  }, [refreshKey, siteKey, theme])

  if (siteKey === '') return null

  return <div className={className} ref={containerRef} />
}
