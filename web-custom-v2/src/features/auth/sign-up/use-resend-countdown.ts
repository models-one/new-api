import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The "resend in {n}s" lock shared by the two places this console asks the server to send
 * an e-mail: the sign-up verification code and the password-reset link.
 *
 * Both endpoints sit behind a rate limiter (`EmailVerificationRateLimit`,
 * `CriticalRateLimit`), so the countdown is what keeps an impatient user from spending
 * their allowance — and, with Turnstile on, from burning a fresh token per click.
 *
 * NOTE FOR THE INTEGRATOR: this belongs in `src/hooks/`. It lives here because the two
 * pages that need it are the only ones in this wave and `src/hooks/` is outside this
 * scope's lane; `password-reset` imports it from here.
 */
export type ResendCountdown = {
  /** Whole seconds remaining; 0 when idle. */
  secondsLeft: number
  /** True while the lock is running. */
  isActive: boolean
  start: () => void
  reset: () => void
}

export function useResendCountdown(seconds: number): ResendCountdown {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const intervalRef = useRef<number | null>(null)

  const clear = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    clear()
    setSecondsLeft(seconds)
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clear()
          return 0
        }
        return current - 1
      })
    }, 1000)
  }, [clear, seconds])

  const reset = useCallback(() => {
    clear()
    setSecondsLeft(0)
  }, [clear])

  useEffect(() => clear, [clear])

  return { isActive: secondsLeft > 0, reset, secondsLeft, start }
}
