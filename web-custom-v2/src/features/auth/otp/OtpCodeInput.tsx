import { useCallback, useRef, useState, type ChangeEvent, type ReactNode } from 'react'

import { Field } from '@/components/form/Field'
import { TOTP_CODE_LENGTH, sanitizeTotpCode } from '@/features/auth/otp/validation'
import { cn } from '@/lib/utils'

type OtpCodeInputProps = {
  /** Names the whole field. One label for one control, never one per box. */
  label: string
  value: string
  onChange: (value: string) => void
  length?: number
  description?: ReactNode
  error?: ReactNode
  disabled?: boolean
  autoFocus?: boolean
}

/**
 * The segmented one-time-code field.
 *
 * The boxes are decoration drawn on top of a single real `input`, which is the
 * whole point: a screen reader hears one labelled text field instead of six
 * anonymous ones, every native behaviour survives (arrow keys, Backspace,
 * select-all, undo, `autocomplete="one-time-code"`), and pasting a full code
 * fills the row because the browser is simply pasting into a text field. Six
 * separate inputs would have to re-implement all of that, and every
 * implementation that tries gets the paste case wrong.
 *
 * The row tracks the caret rather than the value length, so the highlighted box
 * is the one the next keystroke will actually land in even after the user has
 * arrowed backwards.
 */
export function OtpCodeInput(props: OtpCodeInputProps) {
  const {
    label,
    value,
    onChange,
    length = TOTP_CODE_LENGTH,
    description,
    error,
    disabled = false,
    autoFocus = false,
  } = props

  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [caret, setCaret] = useState(0)
  const hasError = error != null && error !== false && error !== ''

  const syncCaret = useCallback(() => {
    const element = inputRef.current
    if (element === null) return
    setCaret(element.selectionStart ?? element.value.length)
  }, [])

  const moveCaretToEnd = useCallback(() => {
    const element = inputRef.current
    if (element === null) return
    const end = element.value.length
    element.setSelectionRange(end, end)
    setCaret(end)
  }, [])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = sanitizeTotpCode(event.target.value, length)
    setCaret(Math.min(event.target.selectionStart ?? next.length, next.length))
    onChange(next)
  }

  const activeIndex = focused ? Math.min(caret, length - 1) : -1

  return (
    <Field description={description} error={error} label={label}>
      {(control) => (
        <div className={cn('relative isolate', disabled && 'opacity-60')}>
          <input
            {...control}
            aria-invalid={hasError || undefined}
            // The provider of the code is an authenticator app; the token hint is
            // still the right one and is what unlocks OS-level code suggestions.
            autoComplete="one-time-code"
            autoFocus={autoFocus}
            className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 outline-none disabled:cursor-not-allowed"
            disabled={disabled}
            inputMode="numeric"
            maxLength={length}
            onBlur={() => setFocused(false)}
            onChange={handleChange}
            onClick={moveCaretToEnd}
            onFocus={() => {
              setFocused(true)
              moveCaretToEnd()
            }}
            onKeyUp={syncCaret}
            onSelect={syncCaret}
            ref={inputRef}
            type="text"
            value={value}
          />

          <div aria-hidden="true" className="flex items-center gap-1.5 sm:gap-2">
            {Array.from({ length }, (_, index) => (
              <span
                className={cn(
                  'field mono flex h-12 flex-1 items-center justify-center text-lg font-bold tabular-nums',
                  hasError && 'border-destructive',
                  index === activeIndex && (hasError ? 'ring-1 ring-destructive' : 'border-primary ring-1 ring-primary'),
                )}
                key={index}
              >
                {value[index] ?? <span className="text-muted/40">&middot;</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </Field>
  )
}
