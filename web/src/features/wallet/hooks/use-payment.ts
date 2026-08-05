/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import i18next from 'i18next'
import { useState, useCallback } from 'react'
import { toast } from 'sonner'

import {
  calculateAmount,
  calculateStripeAmount,
  calculateNowPaymentsAmount,
  calculateWaffoAmount,
  calculateWaffoPancakeAmount,
  requestPayment,
  requestStripePayment,
  requestNowPaymentsPayment,
  isApiSuccess,
} from '../api'
import {
  isStripePayment,
  isNowPaymentsPayment,
  isWaffoPayment,
  isWaffoPancakePayment,
  submitPaymentForm,
} from '../lib'
import type {
  AmountRequest,
  AmountResponse,
  NowPaymentsPaymentRequest,
  NowPaymentsPaymentResponse,
  PaymentRequest,
  PaymentResponse,
  StripePaymentResponse,
} from '../types'

// ============================================================================
// Payment Hook
// ============================================================================

type AmountCalculator = (request: AmountRequest) => Promise<AmountResponse>

export interface PaymentAmountCalculators {
  regular: AmountCalculator
  stripe: AmountCalculator
  nowPayments: AmountCalculator
  waffo: AmountCalculator
  waffoPancake: AmountCalculator
}

const defaultPaymentAmountCalculators: PaymentAmountCalculators = {
  regular: calculateAmount,
  stripe: calculateStripeAmount,
  nowPayments: calculateNowPaymentsAmount,
  waffo: calculateWaffoAmount,
  waffoPancake: calculateWaffoPancakeAmount,
}

export async function requestPaymentAmount(
  topupAmount: number,
  paymentType: string,
  calculators: PaymentAmountCalculators = defaultPaymentAmountCalculators
): Promise<number> {
  let calculator = calculators.regular
  if (isStripePayment(paymentType)) {
    calculator = calculators.stripe
  } else if (isNowPaymentsPayment(paymentType)) {
    calculator = calculators.nowPayments
  } else if (isWaffoPayment(paymentType)) {
    calculator = calculators.waffo
  } else if (isWaffoPancakePayment(paymentType)) {
    calculator = calculators.waffoPancake
  }

  const response = await calculator({ amount: topupAmount })
  if (!isApiSuccess(response) || !response.data) {
    return 0
  }

  return Number.parseFloat(response.data)
}

export interface PaymentRequesters {
  regular: (request: PaymentRequest) => Promise<PaymentResponse>
  stripe: (request: PaymentRequest) => Promise<StripePaymentResponse>
  nowPayments: (
    request: NowPaymentsPaymentRequest
  ) => Promise<NowPaymentsPaymentResponse>
}

const defaultPaymentRequesters: PaymentRequesters = {
  regular: requestPayment,
  stripe: requestStripePayment,
  nowPayments: requestNowPaymentsPayment,
}

export async function requestSelectedPayment(
  topupAmount: number,
  paymentType: string,
  requesters: PaymentRequesters = defaultPaymentRequesters
): Promise<
  PaymentResponse | StripePaymentResponse | NowPaymentsPaymentResponse
> {
  const amount = Math.floor(topupAmount)
  if (isStripePayment(paymentType)) {
    return requesters.stripe({ amount, payment_method: 'stripe' })
  }
  if (isNowPaymentsPayment(paymentType)) {
    return requesters.nowPayments({ amount })
  }
  return requesters.regular({ amount, payment_method: paymentType })
}

export function usePayment() {
  const [amount, setAmount] = useState<number>(0)
  const [calculating, setCalculating] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Calculate payment amount
  const calculatePaymentAmount = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setCalculating(true)
        const calculatedAmount = await requestPaymentAmount(
          topupAmount,
          paymentType
        )
        setAmount(calculatedAmount)
        return calculatedAmount
      } catch {
        setAmount(0)
        return 0
      } finally {
        setCalculating(false)
      }
    },
    []
  )

  // Process payment
  const processPayment = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setProcessing(true)

        const isStripe = isStripePayment(paymentType)
        const isNowPayments = isNowPaymentsPayment(paymentType)
        const response = await requestSelectedPayment(topupAmount, paymentType)

        if (!isApiSuccess(response)) {
          toast.error(response.message || i18next.t('Payment request failed'))
          return false
        }

        // Handle Stripe payment
        const stripeLink =
          isStripe && response.data && 'pay_link' in response.data
            ? response.data.pay_link
            : undefined
        if (typeof stripeLink === 'string' && stripeLink) {
          window.open(stripeLink, '_blank')
          toast.success(i18next.t('Redirecting to payment page...'))
          return true
        }

        const invoiceUrl =
          isNowPayments && response.data && 'invoice_url' in response.data
            ? response.data.invoice_url
            : undefined
        if (typeof invoiceUrl === 'string' && invoiceUrl) {
          try {
            const redirectUrl = new URL(invoiceUrl)
            if (
              redirectUrl.protocol !== 'http:' &&
              redirectUrl.protocol !== 'https:'
            ) {
              throw new Error('unsupported redirect protocol')
            }
            toast.success(i18next.t('Redirecting to payment page...'))
            window.location.href = redirectUrl.toString()
            return true
          } catch {
            toast.error(i18next.t('Invalid payment redirect URL'))
            return false
          }
        }

        // Handle Epay form submission.
        if (!isStripe && !isNowPayments && response.data) {
          const url = (response as unknown as { url?: string }).url
          if (url) {
            submitPaymentForm(url, response.data)
            toast.success(i18next.t('Redirecting to payment page...'))
            return true
          }
        }

        return false
      } catch {
        toast.error(i18next.t('Payment request failed'))
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  return {
    amount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
    setAmount,
  }
}
