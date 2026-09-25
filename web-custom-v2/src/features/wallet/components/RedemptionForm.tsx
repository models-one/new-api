import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form'
import { toErrorMessage, toast } from '@/components/overlay'
import { Button } from '@/components/ui'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { redeemCode } from '@/lib/api/topup'
import { formatQuota } from '@/lib/format'

/**
 * Only rendered when `topup_info.enable_redemption` is true — that flag mirrors the
 * backend's payment-compliance switch, and `POST /api/user/topup` refuses every code
 * while it is off. The endpoint answers with the credited quota on success.
 */
export function RedemptionForm() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const quotaPerUnit = useQuotaPerUnit()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const redemption = useMutation({
    mutationFn: (key: string) => redeemCode(key),
    onSuccess: (credited) => {
      setError(null)
      setCode('')
      toast.success(t('Redeemed {{amount}}', { amount: formatQuota(credited, quotaPerUnit) }))
      void queryClient.invalidateQueries({ queryKey: ['user', 'self'] })
      void queryClient.invalidateQueries({ queryKey: ['topup'] })
    },
    // The shared interceptor already toasted the server message; this is the inline copy.
    onError: (failure: unknown) => setError(toErrorMessage(failure)),
  })

  return (
    <form
      className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start"
      onSubmit={(event) => {
        event.preventDefault()
        const key = code.trim()
        if (key === '') return
        redemption.mutate(key)
      }}
    >
      <Input
        autoComplete="off"
        error={error}
        label={t('Redemption code')}
        onChange={(event) => {
          setCode(event.target.value)
          setError(null)
        }}
        placeholder={t('Paste your code')}
        value={code}
      />
      <Button
        aria-busy={redemption.isPending}
        className="md:mt-7"
        disabled={redemption.isPending || code.trim() === ''}
        type="submit"
      >
        {t('Redeem')}
      </Button>
    </form>
  )
}
