import CheckIcon from 'lucide-react/dist/esm/icons/check'
import CopyIcon from 'lucide-react/dist/esm/icons/copy'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

type CopyButtonSize = 'md' | 'sm' | 'icon-lg' | 'icon-md' | 'icon-sm' | 'icon-xs'
type CopyButtonVariant = 'primary' | 'outline' | 'quiet' | 'danger'

type CopyButtonProps = {
  value: string
  /** Accessible name, e.g. "Copy API key". */
  label: string
  /** Confirmation name; defaults to the shared "Copied" string. */
  successLabel?: string
  /** Failure name; defaults to the shared "Copy failed" string. */
  errorLabel?: string
  size?: CopyButtonSize
  variant?: CopyButtonVariant
  /** Render the label next to the icon instead of an icon-only control. */
  showLabel?: boolean
  onCopied?: (succeeded: boolean) => void
  className?: string
}

export function CopyButton(props: CopyButtonProps) {
  const { t } = useTranslation()
  const { copied, copy } = useCopyToClipboard()
  const [failed, setFailed] = useState(false)

  const {
    value,
    label,
    successLabel = t('Copied'),
    errorLabel = t('Copy failed'),
    size = 'icon-md',
    variant = 'quiet',
    showLabel = false,
    onCopied,
    className,
  } = props

  const handleCopy = async () => {
    const succeeded = await copy(value)
    setFailed(!succeeded)
    onCopied?.(succeeded)
  }

  const currentLabel = (() => {
    if (copied) return successLabel
    if (failed) return errorLabel
    return label
  })()

  return (
    <span className={cn('inline-flex items-center', className)}>
      <Button
        aria-label={currentLabel}
        onClick={() => void handleCopy()}
        size={showLabel && size.startsWith('icon-') ? 'sm' : size}
        title={currentLabel}
        variant={failed ? 'danger' : variant}
      >
        {copied ? <CheckIcon aria-hidden="true" className="text-success" /> : null}
        {!copied && failed ? <TriangleAlertIcon aria-hidden="true" /> : null}
        {!copied && !failed ? <CopyIcon aria-hidden="true" /> : null}
        {showLabel ? currentLabel : null}
      </Button>
      <span className="sr-only" role="status">
        {copied ? successLabel : ''}
        {failed ? errorLabel : ''}
      </span>
    </span>
  )
}
