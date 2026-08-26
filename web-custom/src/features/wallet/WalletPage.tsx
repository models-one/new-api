import BanknoteIcon from 'lucide-react/dist/esm/icons/banknote'
import BitcoinIcon from 'lucide-react/dist/esm/icons/bitcoin'
import CreditCardIcon from 'lucide-react/dist/esm/icons/credit-card'
import LandmarkIcon from 'lucide-react/dist/esm/icons/landmark'
import ReceiptTextIcon from 'lucide-react/dist/esm/icons/receipt-text'
import WalletCardsIcon from 'lucide-react/dist/esm/icons/wallet-cards'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { cn } from '@/lib/utils'

const amounts = [10, 20, 50, 100]
const paymentMethods = [
  { key: 'Credit card', icon: CreditCardIcon },
  { key: 'Crypto', icon: BitcoinIcon },
  { key: 'Alipay', icon: LandmarkIcon },
]

export function WalletPage() {
  const { t } = useTranslation()
  const [amount, setAmount] = useState(50)
  const [customAmount, setCustomAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Alipay')
  const payable = customAmount === '' ? amount * 6.8 : Number(customAmount || 0) * 6.8

  return (
    <div className="flex flex-col gap-8">
      <PageHeader description={t('Review available quota and add funds to the shared balance.')} title={t('Wallet')} />
      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-6"><div className="flex items-center gap-2 text-muted"><WalletCardsIcon aria-hidden="true" className="size-4 text-primary" /><span className="eyebrow">{t('Current balance')}</span></div><p className="mono mt-4 text-4xl font-bold">$501.89</p><p className="mt-2 text-sm text-muted">{t('Available quota')}</p></Panel>
        <Panel className="p-6"><div className="flex items-center gap-2 text-muted"><BanknoteIcon aria-hidden="true" className="size-4 text-info" /><span className="eyebrow">{t('Total usage')}</span></div><p className="mono mt-4 text-4xl font-bold">$7.11</p><p className="mt-2 text-sm text-muted">{t('Total consumed')}</p></Panel>
        <Panel className="p-6"><div className="flex items-center gap-2 text-muted"><ReceiptTextIcon aria-hidden="true" className="size-4 text-secondary" /><span className="eyebrow">{t('API requests')}</span></div><p className="mono mt-4 text-4xl font-bold">1,336</p><p className="mt-2 text-sm text-muted">{t('Total requests')}</p></Panel>
      </div>

      <Panel className="p-6 md:p-8">
        <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold">{t('Add funds')}</h2><p className="mt-1 text-sm text-muted">{t('Select an amount and payment method.')}</p></div><Button variant="quiet"><ReceiptTextIcon aria-hidden="true" />{t('Order history')}</Button></div>
        <div className="mt-7 flex flex-col gap-8">
          <fieldset><legend className="eyebrow mb-4">{t('Amount')}</legend><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{amounts.map((item) => <button aria-pressed={amount === item && customAmount === ''} className={cn('min-h-24 rounded-[4px] border border-border bg-surface-raised p-4 text-left hover:border-primary', amount === item && customAmount === '' && 'border-primary bg-primary/10')} key={item} onClick={() => { setAmount(item); setCustomAmount('') }} type="button"><span className="mono block text-xl font-bold">{item}</span><span className="mt-2 block text-xs text-muted">{t('Pay {{amount}}', { amount: item * 6.8 })}</span></button>)}</div></fieldset>
          <div><label className="eyebrow mb-4 block" htmlFor="custom-amount">{t('Custom amount')}</label><div className="grid gap-3 md:grid-cols-[1fr_240px]"><input className="field mono px-3" id="custom-amount" min="0" onChange={(event) => setCustomAmount(event.target.value)} placeholder={t('Enter amount')} type="number" value={customAmount} /><output className="field flex items-center justify-between px-4 text-sm"><span className="text-muted">{t('To pay')}</span><span className="mono font-bold text-primary">{payable.toFixed(2)}</span></output></div></div>
          <fieldset><legend className="eyebrow mb-4">{t('Payment method')}</legend><div className="grid gap-3 md:grid-cols-3">{paymentMethods.map((method) => { const Icon = method.icon; return <button aria-pressed={paymentMethod === method.key} className={cn('flex min-h-14 items-center gap-3 rounded-[4px] border border-border bg-surface-raised px-4 text-left text-sm hover:border-primary', paymentMethod === method.key && 'border-primary bg-primary/10 text-primary')} key={method.key} onClick={() => setPaymentMethod(method.key)} type="button"><Icon aria-hidden="true" className="size-5" />{t(method.key)}</button> })}</div></fieldset>
          <div className="flex justify-end"><Button className="w-full sm:w-auto">{t('Proceed to payment')}</Button></div>
        </div>
      </Panel>
    </div>
  )
}
