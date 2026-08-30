import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form'
import { Dialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'
import { bindWeChat } from '@/features/profile/identity-api'
import { selfUserQuery } from '@/lib/api/user'

type WeChatBindDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `wechat_qrcode` from `GET /api/status`; '' when the operator configured none. */
  qrCodeUrl: string
}

/**
 * WeChat does not use an OAuth redirect here. The user follows the official account, asks
 * it for a code, and types that code in; `POST /api/oauth/wechat/bind` exchanges it.
 *
 * Only reachable when `wechat_login` is on, so the row that opens this dialog exists only
 * then. WeChat is disabled on the dev server, so the request shape comes from
 * `controller/user.go WeChatBind` rather than a live response.
 */
export function WeChatBindDialog(props: WeChatBindDialogProps) {
  const { onOpenChange, open, qrCodeUrl } = props
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setCode('')
    setError(null)
  }, [open])

  const mutation = useMutation({
    mutationFn: (value: string) => bindWeChat(value),
    onError: (failure: unknown) => setError(toErrorMessage(failure)),
    onSuccess: async () => {
      toast.success(t('WeChat is now linked to your account.'))
      onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: selfUserQuery().queryKey })
    },
  })

  const formId = 'profile-bind-wechat'

  return (
    <Dialog
      description={t('Follow the official account, ask it for a verification code, then enter the code here.')}
      footer={
        <>
          <Button disabled={mutation.isPending} onClick={() => onOpenChange(false)} variant="quiet">
            {t('Cancel')}
          </Button>
          <Button
            aria-busy={mutation.isPending}
            disabled={mutation.isPending || code.trim() === ''}
            form={formId}
            type="submit"
          >
            {t('Link WeChat')}
          </Button>
        </>
      }
      onOpenChange={(next) => {
        if (mutation.isPending && !next) return
        onOpenChange(next)
      }}
      open={open}
      scrollBody={false}
      size="sm"
      title={t('Link WeChat')}
    >
      <form
        className="flex flex-col gap-4"
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          const value = code.trim()
          if (value === '') return
          setError(null)
          mutation.mutate(value)
        }}
      >
        {qrCodeUrl === '' ? (
          <Alert tone="warning">
            {t('No QR code is configured on this deployment, so there is nothing to scan. Ask an administrator to add one.')}
          </Alert>
        ) : (
          <div className="flex justify-center">
            <img
              alt={t('QR code for the WeChat official account')}
              className="size-48 rounded-[4px] border border-border object-contain"
              src={qrCodeUrl}
            />
          </div>
        )}

        {error === null ? null : <Alert tone="destructive">{error}</Alert>}

        <Input
          autoComplete="one-time-code"
          disabled={mutation.isPending}
          inputClassName="mono"
          label={t('Verification code')}
          onChange={(event) => {
            setCode(event.target.value)
            setError(null)
          }}
          value={code}
        />
      </form>
    </Dialog>
  )
}
