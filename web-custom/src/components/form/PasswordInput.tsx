import EyeIcon from 'lucide-react/dist/esm/icons/eye'
import EyeOffIcon from 'lucide-react/dist/esm/icons/eye-off'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, type InputProps } from '@/components/form/Input'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export type PasswordInputProps = Omit<InputProps, 'suffix' | 'type'> & {
  /** Controlled reveal state; falls back to internal state when omitted. */
  revealed?: boolean
  onRevealedChange?: (revealed: boolean) => void
  /** Overrides the built-in toggle labels. */
  showPasswordLabel?: string
  hidePasswordLabel?: string
}

export function PasswordInput(props: PasswordInputProps) {
  const {
    revealed,
    onRevealedChange,
    showPasswordLabel,
    hidePasswordLabel,
    controlClassName,
    disabled,
    ...inputProps
  } = props

  const { t } = useTranslation()
  const [internalRevealed, setInternalRevealed] = useState(false)
  const isRevealed = revealed ?? internalRevealed
  const toggleLabel = isRevealed
    ? hidePasswordLabel ?? t('Hide password')
    : showPasswordLabel ?? t('Show password')

  const toggleRevealed = () => {
    const next = !isRevealed
    if (revealed === undefined) setInternalRevealed(next)
    onRevealedChange?.(next)
  }

  return (
    <Input
      {...inputProps}
      controlClassName={cn('pr-1', controlClassName)}
      disabled={disabled}
      inputClassName={cn('mono', props.inputClassName)}
      suffix={
        <Button
          aria-label={toggleLabel}
          aria-pressed={isRevealed}
          disabled={disabled}
          onClick={toggleRevealed}
          size="icon-sm"
          title={toggleLabel}
          variant="quiet"
        >
          {isRevealed ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
        </Button>
      }
      type={isRevealed ? 'text' : 'password'}
    />
  )
}
