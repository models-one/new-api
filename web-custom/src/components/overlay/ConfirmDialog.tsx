import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog, type DialogSize } from '@/components/overlay/Dialog'
import { Button } from '@/components/ui/Button'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Label of the confirming button, e.g. t('Delete key'). */
  confirmLabel: string
  /** Label of the dismissing button, e.g. t('Cancel'). */
  cancelLabel: string
  /** Renders the confirm button in the danger variant. */
  destructive?: boolean
  /** Puts the confirm button in the busy state: aria-busy + disabled. */
  isLoading?: boolean
  onConfirm: () => void
  /** Type-to-confirm gate: the confirm button stays disabled until this exact text is typed. */
  confirmPhrase?: string
  /** Overrides the gate input label; defaults to the translated "Type {{phrase}} to confirm". */
  confirmPhraseLabel?: string
  size?: DialogSize
  /** Extra content rendered under the description and above the gate input. */
  children?: ReactNode
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { t } = useTranslation()
  const {
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel,
    destructive = false,
    isLoading = false,
    onConfirm,
    confirmPhrase,
    confirmPhraseLabel,
    size = 'sm',
    children,
  } = props

  const phraseInputId = useId()
  const phraseInputRef = useRef<HTMLInputElement>(null)
  const [typedPhrase, setTypedPhrase] = useState('')

  useEffect(() => {
    if (!open) setTypedPhrase('')
  }, [open])

  const phraseSatisfied = confirmPhrase === undefined || typedPhrase.trim() === confirmPhrase
  const phraseLabel = confirmPhraseLabel
    ?? t('Type {{phrase}} to confirm', { phrase: confirmPhrase ?? '' })

  const hasBodyContent = children !== undefined || confirmPhrase !== undefined

  return (
    <Dialog
      bodyClassName={hasBodyContent ? undefined : 'py-0'}
      description={description}
      footer={(
        <>
          <Button disabled={isLoading} onClick={() => onOpenChange(false)} variant="quiet">
            {cancelLabel}
          </Button>
          <Button
            aria-busy={isLoading}
            disabled={isLoading || !phraseSatisfied}
            onClick={onConfirm}
            variant={destructive ? 'danger' : 'primary'}
          >
            {confirmLabel}
          </Button>
        </>
      )}
      initialFocus={confirmPhrase === undefined ? undefined : phraseInputRef}
      onOpenChange={(nextOpen) => {
        if (isLoading && !nextOpen) return
        onOpenChange(nextOpen)
      }}
      open={open}
      scrollBody={false}
      size={size}
      title={title}
    >
      {children}
      {confirmPhrase === undefined ? null : (
        <div className="mt-4 flex flex-col gap-2">
          <label className="text-sm font-semibold text-foreground" htmlFor={phraseInputId}>
            {phraseLabel}
          </label>
          <input
            autoComplete="off"
            className="field mono w-full px-3 text-sm"
            id={phraseInputId}
            onChange={(event) => setTypedPhrase(event.target.value)}
            ref={phraseInputRef}
            spellCheck={false}
            type="text"
            value={typedPhrase}
          />
        </div>
      )}
    </Dialog>
  )
}
