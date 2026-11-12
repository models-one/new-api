import { useMutation, useQuery } from '@tanstack/react-query'
import CreditCardIcon from 'lucide-react/dist/esm/icons/credit-card'
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableEmpty } from '@/components/data'
import { NumberInput } from '@/components/form'
import { toErrorMessage } from '@/components/overlay'
import { Button, Skeleton } from '@/components/ui'
import { enabledPayMethods } from '@/features/wallet/pay-methods'
import { openTopUpCheckout, requestTopUpCheckout } from '@/features/wallet/topup-checkout'
import { topUpQuoteQuery } from '@/features/wallet/topup-quote'
import type { QuoteRoute, TopUpInfo } from '@/lib/api/topup'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const tileClasses = cn(
  'flex cursor-pointer flex-col justify-center gap-1 rounded-[4px] border border-border bg-surface-raised p-4 transition-colors',
  'hover:border-primary',
  'has-[:checked]:border-primary has-[:checked]:bg-primary/10',
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
)

/**
 * Amount presets, method selection and the provider price quote.
 *
 * The payable figure is never computed here: `/api/user/.../amount` owns the
 * price (group ratio, unit price and preset discount all live server-side), and
 * the response carries no currency code, so the quote is rendered verbatim.
 */
export function TopUpForm(props: { info: TopUpInfo }) {
  const { t } = useTranslation()
  const { info } = props

  const payMethods = enabledPayMethods(info)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [presetAmount, setPresetAmount] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkingQuote, setCheckingQuote] = useState(false)
  const checkoutLock = useRef(false)

  const selectedMethod = payMethods.find((entry) => entry.method.type === selectedType) ?? payMethods[0]

  // `amount_options` is a Go `[]int`, so an administrator who saves an empty preset
  // list sends `null` rather than `[]`. The shared type declares it non-nullable, and
  // mapping the null would throw — the custom-amount field still works without presets.
  const amountOptions = Array.isArray(info.amount_options) ? info.amount_options : []

  const customValue = customAmount.trim()
  const usesCustomAmount = customValue !== ''
  const activePreset = usesCustomAmount ? null : presetAmount ?? amountOptions[0] ?? null
  const chosenAmount = usesCustomAmount ? Number(customValue) : activePreset
  const minTopUp = selectedMethod?.minTopUp ?? info.min_topup

  let amountError: string | null = null
  if (chosenAmount !== null && !Number.isFinite(chosenAmount)) {
    amountError = t('Enter a valid amount')
  } else if (chosenAmount !== null && !Number.isInteger(chosenAmount)) {
    // The Go handlers bind `amount` into an int64, so a fractional value is rejected outright.
    amountError = t('Enter a whole number')
  } else if (chosenAmount !== null && chosenAmount < minTopUp) {
    amountError = t('The minimum top-up is {{amount}}', { amount: minTopUp })
  }

  const canQuote = selectedMethod !== undefined && chosenAmount !== null && amountError === null
  const quoteQuery = useQuery({
    ...topUpQuoteQuery(selectedMethod?.route ?? 'epay', chosenAmount ?? 0),
    enabled: canQuote,
  })
  const checkout = useMutation({
    mutationFn: ({ route, amount, paymentMethod }: {
      route: QuoteRoute
      amount: number
      paymentMethod: string
    }) => requestTopUpCheckout(route, amount, paymentMethod),
    onSuccess: (handoff) => {
      setCheckoutError(null)
      openTopUpCheckout(handoff)
    },
    onError: (failure: unknown) => {
      checkoutLock.current = false
      setCheckoutError(t(toErrorMessage(failure, t('Could not start payment'))))
    },
  })
  const canCheckout = canQuote
    && quoteQuery.isSuccess
    && !quoteQuery.isFetching
    && quoteQuery.data.kind === 'quote'
    && quoteQuery.data.payable > 0
    && !checkingQuote
    && !checkout.isPending
    && !checkoutLock.current

  if (payMethods.length === 0) {
    return (
      <DataTableEmpty
        action={
          info.topup_link === '' ? undefined : (
            <Button
              render={
                <a href={info.topup_link} rel="noreferrer noopener" target="_blank">
                  {t('Open the top-up page')}
                </a>
              }
              variant="outline"
            />
          )
        }
        description={t(
          'No payment provider is enabled on this deployment, so there is no online checkout to show. An administrator turns these on in the payment settings.',
        )}
        icon={<CreditCardIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
        title={t('Online payment is not configured')}
      />
    )
  }

  let quote: ReactNode = <span className="text-sm text-muted">{t('Choose an amount to see the price')}</span>
  if (amountError !== null) {
    // A preset can also fall under a provider's minimum, and that field carries no error slot.
    quote = <span className="text-sm text-destructive">{amountError}</span>
  } else if (canQuote && quoteQuery.isPending) {
    quote = <Skeleton height={20} variant="block" width={88} />
  } else if (canQuote && quoteQuery.isError) {
    quote = <span className="text-sm text-destructive">{t('Could not reach the payment provider')}</span>
  } else if (quoteQuery.data?.kind === 'rejected') {
    const { message } = quoteQuery.data
    quote = (
      <span className="text-sm text-destructive">
        {message === '' ? t('The payment provider rejected this amount') : message}
      </span>
    )
  } else if (quoteQuery.data?.kind === 'quote') {
    quote = <span className="mono text-lg font-bold text-primary">{quoteQuery.data.raw}</span>
  }

  return (
    <div className="flex flex-col gap-8">
      <fieldset className="min-w-0">
        <legend className="eyebrow mb-4">{t('Amount')}</legend>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {amountOptions.map((option) => (
            <label className={tileClasses} key={option}>
              <input
                checked={activePreset === option}
                className="sr-only"
                disabled={checkingQuote || checkout.isPending || checkoutLock.current}
                name="wallet-topup-amount"
                onChange={() => {
                  setPresetAmount(option)
                  setCustomAmount('')
                  setCheckoutError(null)
                }}
                type="radio"
                value={option}
              />
              <span className="mono text-xl font-bold">{formatNumber(option)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-[1fr_260px] md:items-start">
        <NumberInput
          description={t('Minimum {{amount}} with {{method}}', {
            amount: minTopUp,
            method: selectedMethod?.method.name ?? '',
          })}
          disabled={checkingQuote || checkout.isPending || checkoutLock.current}
          error={usesCustomAmount ? amountError : null}
          label={t('Custom amount')}
          min={minTopUp}
          onChange={(event) => {
            setCustomAmount(event.target.value)
            setCheckoutError(null)
          }}
          placeholder={t('Enter amount')}
          step={1}
          value={customAmount}
        />
        <output
          aria-busy={quoteQuery.isFetching}
          className="field flex min-h-10 items-center justify-between gap-3 px-4 py-2 md:mt-7"
        >
          <span className="text-sm text-muted">{t('Amount payable')}</span>
          {quote}
        </output>
      </div>

      <fieldset className="min-w-0">
        <legend className="eyebrow mb-4">{t('Payment method')}</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {payMethods.map((entry) => (
            <label className={cn(tileClasses, 'flex-row items-center gap-3')} key={entry.method.type}>
              <input
                checked={selectedMethod?.method.type === entry.method.type}
                className="sr-only"
                disabled={checkingQuote || checkout.isPending || checkoutLock.current}
                name="wallet-payment-method"
                onChange={() => {
                  setSelectedType(entry.method.type)
                  setCheckoutError(null)
                }}
                type="radio"
                value={entry.method.type}
              />
              {entry.method.color ? (
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.method.color }}
                />
              ) : null}
              <span className="text-sm font-semibold">{entry.method.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        {checkoutError === null ? null : (
          <p className="text-sm text-destructive sm:mr-auto" id="wallet-checkout-error" role="alert">
            {checkoutError}
          </p>
        )}
        <Button
          aria-busy={checkingQuote || checkout.isPending}
          aria-describedby={checkoutError === null ? undefined : 'wallet-checkout-error'}
          disabled={!canCheckout}
          onClick={() => {
            if (!canCheckout || checkoutLock.current || chosenAmount === null || selectedMethod === undefined) return
            if (quoteQuery.data?.kind !== 'quote') return
            checkoutLock.current = true
            setCheckingQuote(true)
            setCheckoutError(null)
            const displayedPayable = quoteQuery.data.payable
            void (async () => {
              let orderRequested = false
              try {
                const latest = await quoteQuery.refetch()
                if (latest.isError || latest.data?.kind !== 'quote' || latest.data.payable <= 0) return
                if (latest.data.payable !== displayedPayable) {
                  setCheckoutError(t('The price changed. Review the new amount before paying.'))
                  return
                }
                checkout.mutate({
                  route: selectedMethod.route,
                  amount: chosenAmount,
                  paymentMethod: selectedMethod.method.type,
                })
                orderRequested = true
              } catch (failure) {
                setCheckoutError(t(toErrorMessage(failure, t('Could not reach the payment provider'))))
              } finally {
                if (!orderRequested) checkoutLock.current = false
                setCheckingQuote(false)
              }
            })()
          }}
        >
          {t('Proceed to payment')}
        </Button>
      </div>
    </div>
  )
}
