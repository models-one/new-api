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
import { describe, expect, test } from 'vitest'

import { PAYMENT_TYPES } from '../constants'
import { requestPaymentAmount, requestSelectedPayment } from './use-payment'

describe('payment amount routing', () => {
  test('uses the dedicated Waffo amount calculator', async () => {
    const calls: string[] = []
    const amount = await requestPaymentAmount(120, PAYMENT_TYPES.WAFFO, {
      regular: async () => {
        calls.push('regular')
        return { success: true, data: '1' }
      },
      stripe: async () => {
        calls.push('stripe')
        return { success: true, data: '2' }
      },
      nowPayments: async () => {
        calls.push('nowpayments')
        return { success: true, data: '3' }
      },
      waffo: async (request) => {
        calls.push(`waffo:${request.amount}`)
        return { success: true, data: '18.75' }
      },
      waffoPancake: async () => {
        calls.push('pancake')
        return { success: true, data: '4' }
      },
    })

    expect(amount).toBe(18.75)
    expect(calls).toEqual(['waffo:120'])
  })

  test('uses the dedicated NOWPayments amount calculator', async () => {
    const calls: string[] = []
    const amount = await requestPaymentAmount(50, PAYMENT_TYPES.NOWPAYMENTS, {
      regular: async () => {
        calls.push('regular')
        return { success: true, data: '1' }
      },
      stripe: async () => ({ success: true, data: '2' }),
      nowPayments: async (request) => {
        calls.push(`nowpayments:${request.amount}`)
        return { success: true, data: '49.99' }
      },
      waffo: async () => ({ success: true, data: '3' }),
      waffoPancake: async () => ({ success: true, data: '4' }),
    })

    expect(amount).toBe(49.99)
    expect(calls).toEqual(['nowpayments:50'])
  })
})

describe('payment request routing', () => {
  test('sends nowpayments to its hosted invoice endpoint requester', async () => {
    const calls: string[] = []

    const response = await requestSelectedPayment(
      50.9,
      PAYMENT_TYPES.NOWPAYMENTS,
      {
        regular: async () => {
          calls.push('regular')
          return { message: 'error' }
        },
        stripe: async () => {
          calls.push('stripe')
          return { message: 'error' }
        },
        nowPayments: async (request) => {
          calls.push(`nowpayments:${request.amount}`)
          return {
            message: 'success',
            data: { invoice_url: 'https://nowpayments.io/payment/?iid=1' },
          }
        },
      }
    )

    expect(calls).toEqual(['nowpayments:50'])
    expect(response.message).toBe('success')
  })
})
