import EyeIcon from 'lucide-react/dist/esm/icons/eye'
import EyeOffIcon from 'lucide-react/dist/esm/icons/eye-off'
import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { cn } from '@/lib/utils'

type MaskedValueCopyProps =
  | {
      copyable: true
      /** Accessible name for the copy control. */
      copyLabel: string
    }
  | {
      copyable?: false
      copyLabel?: never
    }

type MaskedValueProps = {
  value: string
  /** Controlled visibility. Omit both this and `onToggleVisibility` to manage it internally. */
  visible?: boolean
  onToggleVisibility?: () => void
  /** Defaults to `maskSecret`. */
  maskFn?: (value: string) => string
  /** Accessible name for the reveal control. */
  showLabel: string
  /** Accessible name for the hide control. */
  hideLabel: string
  size?: 'sm' | 'md'
  className?: string
} & MaskedValueCopyProps

/** Keeps the head and tail of a secret readable while hiding the body. */
export function maskSecret(value: string): string {
  if (value.length < 10) return '••••••••'
  return `${value.slice(0, 7)}••••••••${value.slice(-4)}`
}

export function MaskedValue(props: MaskedValueProps) {
  const {
    value,
    visible,
    onToggleVisibility,
    maskFn = maskSecret,
    showLabel,
    hideLabel,
    size = 'md',
    className,
    copyable = false,
    copyLabel,
  } = props

  const [internalVisible, setInternalVisible] = useState(false)
  const isVisible = visible ?? internalVisible
  const toggleLabel = isVisible ? hideLabel : showLabel

  const toggle = () => {
    if (onToggleVisibility) {
      onToggleVisibility()
      return
    }
    setInternalVisible((current) => !current)
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      <code
        className={cn(
          'mono min-w-0 truncate rounded-[4px] border border-border bg-surface-high px-3 text-foreground',
          size === 'sm' ? 'py-1 text-xs' : 'py-2 text-sm',
        )}
      >
        {isVisible ? value : maskFn(value)}
      </code>
      <Button
        aria-label={toggleLabel}
        aria-pressed={isVisible}
        onClick={toggle}
        size={size === 'sm' ? 'icon-sm' : 'icon-md'}
        title={toggleLabel}
        variant="quiet"
      >
        {isVisible ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
      </Button>
      {copyable && copyLabel ? (
        <CopyButton
          label={copyLabel}
          size={size === 'sm' ? 'icon-sm' : 'icon-md'}
          value={value}
        />
      ) : null}
    </span>
  )
}
