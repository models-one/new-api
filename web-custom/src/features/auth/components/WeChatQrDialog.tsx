import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form/Input'
import { Dialog } from '@/components/overlay/Dialog'
import { Button } from '@/components/ui/Button'

type WeChatQrDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `wechat_qrcode` from /api/status. Empty when the operator never configured one. */
  qrCodeUrl: string
  pending: boolean
  onSubmit: (code: string) => void
  /** Additional reason the confirm control stays disabled, e.g. unmet legal consent. */
  disabled?: boolean
}

/**
 * The WeChat verification-code exchange, in one place.
 *
 * The legacy console pasted this dialog into the sign-in form and again into the
 * sign-up form, byte for byte. Both now mount this component.
 */
export function WeChatQrDialog(props: WeChatQrDialogProps) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const formId = useId()

  useEffect(() => {
    if (!props.open) setCode('')
  }, [props.open])

  const trimmedCode = code.trim()
  const submitDisabled = props.pending || props.disabled === true || trimmedCode === ''

  return (
    <Dialog
      description={t('Scan the QR code in WeChat, follow the official account, then reply to it to receive your verification code.')}
      footer={(
        <>
          <Button
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
            variant="outline"
          >
            {t('Cancel')}
          </Button>
          <Button
            aria-busy={props.pending}
            disabled={submitDisabled}
            form={formId}
            type="submit"
          >
            {t('Confirm')}
          </Button>
        </>
      )}
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="sm"
      title={t('WeChat sign-in')}
    >
      {props.qrCodeUrl === '' ? (
        <p className="text-sm leading-6 text-muted">
          {t('No QR code is configured. Ask your operator to add one.')}
        </p>
      ) : (
        <div className="flex justify-center">
          <img
            alt={t('WeChat sign-in QR code')}
            className="size-40 rounded-[4px] border border-border object-contain"
            src={props.qrCodeUrl}
          />
        </div>
      )}

      <form
        className="mt-5"
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          if (submitDisabled) return
          props.onSubmit(trimmedCode)
        }}
      >
        <Input
          autoComplete="one-time-code"
          disabled={props.pending}
          inputClassName="mono"
          label={t('Verification code')}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t('Enter the code you received')}
          value={code}
        />
      </form>
    </Dialog>
  )
}
