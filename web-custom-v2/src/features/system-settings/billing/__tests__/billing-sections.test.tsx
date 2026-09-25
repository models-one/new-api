// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put, delete: del } }))

const { CheckinSection } = await import('@/features/system-settings/billing/CheckinSection')
const { CurrencySection } = await import('@/features/system-settings/billing/CurrencySection')
const { GroupPricingSection } = await import('@/features/system-settings/billing/GroupPricingSection')
const { ModelPricingSection } = await import('@/features/system-settings/billing/ModelPricingSection')
const { PaymentSection } = await import('@/features/system-settings/billing/PaymentSection')
const { QuotaSection } = await import('@/features/system-settings/billing/QuotaSection')

/**
 * THE BILLING SECTIONS, AGAINST THE PAYLOAD THE DEV SERVER ACTUALLY RETURNS.
 *
 * Every value below is a STRING, because every one of the 234 values in
 * `GET /api/option/` is. A refusal is HTTP 200 with `{success:false, message}`, not a 4xx,
 * so `server.refuse` models it that way.
 *
 * These tests are about branching that costs money if it is wrong: the compliance gate,
 * the divisor guard, the JSON blobs whose refused write corrupts the stored value, and
 * the write-only credentials.
 */
const seeded: Record<string, string> = {
  AudioCompletionRatio: '{}',
  AudioRatio: '{"gpt-4o-audio-preview":16}',
  AutoGroups: '["default"]',
  'billing_setting.billing_expr': '{}',
  'billing_setting.billing_mode': '{}',
  CacheRatio: '{}',
  'checkin_setting.enabled': 'false',
  'checkin_setting.max_quota': '10000',
  'checkin_setting.min_quota': '1000',
  CompletionRatio: '{"gpt-4-all":2}',
  CreateCacheRatio: '{}',
  CreemProducts: '[]',
  CreemTestMode: 'false',
  CustomCallbackAddress: '',
  DefaultUseAutoGroup: 'false',
  DisplayInCurrencyEnabled: 'true',
  DisplayTokenStatEnabled: 'true',
  EpayId: '',
  ExposeRatioEnabled: 'false',
  'general_setting.custom_currency_exchange_rate': '1',
  'general_setting.custom_currency_symbol': '¤',
  'general_setting.docs_link': 'https://docs.newapi.pro',
  'general_setting.quota_display_type': 'USD',
  'group_ratio_setting.group_special_usable_group': '{}',
  GroupGroupRatio: '{"vip":{"edit_this":0.9}}',
  GroupRatio: '{"default":1,"svip":1,"vip":1}',
  ImageRatio: '{"gpt-image-1":2}',
  MinTopUp: '1',
  ModelPrice: '{"dall-e-3":0.04}',
  ModelRatio: '{"gpt-4-all":15}',
  NowPaymentsFeePaidByUser: 'false',
  NowPaymentsMinTopUp: '1',
  NowPaymentsUnitPrice: '1',
  PayAddress: '',
  'payment_setting.amount_discount': '{}',
  'payment_setting.amount_options': '[10,20,50,100,200,500]',
  'payment_setting.compliance_confirmed': 'true',
  'payment_setting.compliance_confirmed_at': '1788047578',
  'payment_setting.compliance_confirmed_by': '1',
  'payment_setting.compliance_confirmed_ip': '127.0.0.1',
  'payment_setting.compliance_terms_version': 'v1',
  PayMethods: '[{"icon":"SiAlipay","name":"支付宝","type":"alipay"}]',
  PreConsumedQuota: '500',
  Price: '7.3',
  QuotaForInvitee: '0',
  QuotaForInviter: '0',
  QuotaForNewUser: '0',
  QuotaPerUnit: '500000',
  'quota_setting.enable_free_model_pre_consume': 'true',
  StripeMinTopUp: '1',
  StripePriceId: '',
  StripePromotionCodesEnabled: 'false',
  StripeUnitPrice: '8',
  'tool_price_setting.prices': '{}',
  TopUpLink: '',
  TopupGroupRatio: '{"default":1,"svip":1,"vip":1}',
  USDExchangeRate: '7.3',
  UserUsableGroups: '{"default":"默认分组","vip":"vip分组"}',
  WaffoCurrency: '',
  WaffoEnabled: 'false',
  WaffoMerchantId: '',
  WaffoMinTopUp: '1',
  WaffoNotifyUrl: '',
  WaffoPancakeMerchantID: '',
  WaffoPancakeMinTopUp: '1',
  WaffoPancakeProductID: '',
  WaffoPancakeReturnURL: '',
  WaffoPancakeStoreID: '',
  WaffoPancakeUnitPrice: '1',
  WaffoPayMethods: '[]',
  WaffoPublicCert: '',
  WaffoReturnUrl: '',
  WaffoSandbox: 'false',
  WaffoSandboxPublicCert: '',
  WaffoSubscriptionReturnUrl: '',
  WaffoUnitPrice: '3',
}

type ServerState = {
  stored: Record<string, string>
  /** Keys the server should refuse, mapped to the sentence it refuses them with. */
  refuse: Record<string, string>
  topUpFails: boolean
  /** `GET /api/channel/models_enabled`. Go serialises an empty slice as null. */
  enabledModels: string[] | null
  /** That endpoint sits behind channel:read, which root can be missing. */
  enabledModelsFails: boolean
}

let server: ServerState

function renderSection(node: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(node, { wrapper })
}

/** Every `{key, value}` a section has written, in order. */
function writes(): { key: string; value: string }[] {
  return put.mock.calls
    .filter((call) => call[0] === '/api/option/')
    .map((call) => call[1] as { key: string; value: string })
}

function writtenKeys(): string[] {
  return writes().map((write) => write.key)
}

async function save() {
  fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
}

/**
 * Waits for the option payload to land before the test touches anything.
 *
 * Every section renders immediately against `options === undefined` — the real loading
 * state — with its fields holding their fallbacks and every control disabled. Interacting
 * during that window quietly does nothing, so a test written without this waits on
 * nothing and passes for the wrong reason.
 *
 * It waits on a control being ENABLED rather than on a value, deliberately: several of
 * these settings have a fallback equal to what the dev server stores (`QuotaPerUnit` is
 * 500000 both ways, `MinTopUp` is 1 both ways), so a value assertion cannot tell the
 * loading state from the loaded one. Being enabled can only mean the payload arrived.
 */
async function settled(controlLabel: RegExp | string) {
  await waitFor(() => expect(screen.getByLabelText(controlLabel)).toBeEnabled())
}

beforeEach(() => {
  server = {
    enabledModels: ['gpt-4-all', 'dall-e-3'],
    enabledModelsFails: false,
    refuse: {},
    stored: { ...seeded },
    topUpFails: false,
  }

  get.mockReset()
  put.mockReset()
  post.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/option/') {
      return Promise.resolve({
        data: {
          data: Object.entries(server.stored).map(([key, value]) => ({ key, value })),
          message: '',
          success: true,
        },
      })
    }
    if (url === '/api/status') {
      return Promise.resolve({
        data: { data: { quota_per_unit: 500_000 }, message: '', success: true },
      })
    }
    if (url === '/api/channel/models_enabled') {
      if (server.enabledModelsFails) {
        return Promise.resolve({
          data: { data: null, message: 'no permission for channel', success: false },
        })
      }
      return Promise.resolve({
        data: { data: server.enabledModels, message: '', success: true },
      })
    }
    if (url === '/api/user/topup/info') {
      if (server.topUpFails) return Promise.reject(new Error('the readiness check is down'))
      return Promise.resolve({
        data: {
          data: {
            amount_options: [10, 20],
            creem_products: '[]',
            discount: {},
            enable_creem_topup: false,
            enable_nowpayments_topup: false,
            enable_online_topup: false,
            enable_redemption: true,
            enable_stripe_topup: true,
            enable_waffo_pancake_topup: false,
            enable_waffo_topup: false,
            min_topup: 1,
            nowpayments_min_topup: 1,
            pay_methods: [],
            payment_compliance_confirmed: true,
            payment_compliance_terms_version: 'v1',
            stripe_min_topup: 1,
            topup_link: '',
            waffo_min_topup: 1,
            waffo_pancake_min_topup: 1,
            waffo_pay_methods: null,
          },
          message: '',
          success: true,
        },
      })
    }
    throw new Error(`unmocked GET ${url}`)
  })

  put.mockImplementation((url: string, body: { key: string; value: string }) => {
    if (url !== '/api/option/') throw new Error(`unmocked PUT ${url}`)
    const refusal = server.refuse[body.key]
    if (refusal !== undefined) {
      return Promise.resolve({ data: { message: refusal, success: false } })
    }
    server.stored[body.key] = body.value
    return Promise.resolve({ data: { message: '', success: true } })
  })

  post.mockImplementation(() => Promise.resolve({ data: { message: '', success: true } }))
})

afterEach(cleanup)

describe('QuotaSection and the payment-compliance gate', () => {
  it('reads the amounts off a payload in which every value is a string', async () => {
    renderSection(<QuotaSection />)
    await settled(/Pre-consumed quota/)

    expect(screen.getByLabelText(/Pre-consumed quota/)).toHaveValue(500)
    expect(screen.getByRole('switch', { name: /Pre-consume quota for free models/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('writes a positive invitation reward while the compliance terms are accepted', async () => {
    renderSection(<QuotaSection />)
    await settled(/Pre-consumed quota/)

    fireEvent.change(screen.getByLabelText(/Reward for the inviter/), { target: { value: '1000' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'QuotaForInviter', value: '1000' })
  })

  it('will not even attempt a positive reward while the terms are unaccepted', async () => {
    // controller/option.go refuses QuotaForInviter/Invitee for a positive value until
    // IsPaymentComplianceConfirmed(). Firing a write that is certain to come back refused
    // teaches the operator nothing, so the gate is named in the field instead.
    server.stored['payment_setting.compliance_confirmed'] = 'false'
    renderSection(<QuotaSection />)

    expect(await screen.findByText('Invitation rewards are locked')).toBeInTheDocument()
    await settled(/Pre-consumed quota/)

    fireEvent.change(screen.getByLabelText(/Reward for the inviter/), { target: { value: '1000' } })
    await save()

    expect(
      await screen.findByText(
        'The server refuses a reward above zero until the payment compliance terms are accepted, under Billing → Payment gateway.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('still lets a reward be set back to zero while the gate is closed', async () => {
    // Zero is always accepted server-side, so the gate must not block the way out.
    server.stored['payment_setting.compliance_confirmed'] = 'false'
    server.stored.QuotaForInviter = '5000'
    renderSection(<QuotaSection />)
    await settled(/Reward for the inviter/)
    expect(screen.getByLabelText(/Reward for the inviter/)).toHaveValue(5000)

    fireEvent.change(screen.getByLabelText(/Reward for the inviter/), { target: { value: '0' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'QuotaForInviter', value: '0' })
  })

  it('treats an accepted-but-stale terms version as a closed gate', async () => {
    server.stored['payment_setting.compliance_terms_version'] = 'v0'
    renderSection(<QuotaSection />)
    expect(await screen.findByText('Invitation rewards are locked')).toBeInTheDocument()
  })

  it('surfaces the server’s own sentence when the gate closes underneath the form', async () => {
    // A stale read, or a second operator. The optimistic value must not stand.
    server.refuse.QuotaForInviter = '请先确认支付合规条款'
    renderSection(<QuotaSection />)
    await settled(/Pre-consumed quota/)

    fireEvent.change(screen.getByLabelText(/Reward for the inviter/), { target: { value: '1000' } })
    await save()

    expect(await screen.findByText('The server refused some of these settings')).toBeInTheDocument()
    expect(screen.getByText('请先确认支付合规条款')).toBeInTheDocument()
    // The refused key keeps the operator's value so a second Save retries only that one.
    expect(screen.getByLabelText(/Reward for the inviter/)).toHaveValue(1000)
  })

  it('rejects a top-up link that is not an absolute http address', async () => {
    renderSection(<QuotaSection />)
    await settled(/Pre-consumed quota/)

    fireEvent.change(screen.getByLabelText(/Top-up link/), { target: { value: 'example.com/topup' } })
    await save()

    expect(
      await screen.findByText('Enter a full http:// or https:// address, or leave this empty.'),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })
})

describe('CurrencySection and the divisor everything is expressed with', () => {
  it('refuses a divisor of zero, which the server accepts without complaint', async () => {
    // model/option.go: `common.QuotaPerUnit, _ = strconv.ParseFloat(value, 64)` — the
    // error is DISCARDED. Verified live: "0" and "abc" both answer success:true and leave
    // every currency figure in the deployment dividing by zero.
    renderSection(<CurrencySection />)
    await settled(/Quota divisor/)

    fireEvent.change(screen.getByLabelText(/Quota divisor/), { target: { value: '0' } })
    await save()

    expect(
      await screen.findByText(
        'The divisor must be greater than zero. The server accepts zero without complaint and every currency figure then divides by it.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('spells out the repricing before a legal change is saved', async () => {
    renderSection(<CurrencySection />)
    await settled(/Quota divisor/)

    expect(screen.queryByText('This reprices every figure in the console')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Quota divisor/), { target: { value: '100000' } })

    expect(await screen.findByText('This reprices every figure in the console')).toBeInTheDocument()
    await save()
    await waitFor(() => expect(writes()).toEqual([{ key: 'QuotaPerUnit', value: '100000' }]))
  })

  it('only asks for a custom symbol and rate once a custom currency is chosen', async () => {
    renderSection(<CurrencySection />)
    await settled(/Quota divisor/)
    expect(screen.queryByLabelText(/Custom currency symbol/)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Balance display/), { target: { value: 'CUSTOM' } })
    expect(await screen.findByLabelText(/Custom currency symbol/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Custom currency symbol/), { target: { value: '  ' } })
    await save()
    expect(await screen.findByText('A custom display needs a symbol.')).toBeInTheDocument()
    expect(writtenKeys()).not.toContain('general_setting.custom_currency_symbol')
  })

  it('writes the explicit display choice after the flag the server derives it from', async () => {
    // Writing DisplayInCurrencyEnabled makes the server ALSO set quota_display_type
    // (true -> USD, false -> TOKENS). Keys are written in sorted order, and
    // 'DisplayInCurrencyEnabled' sorts before 'general_setting.quota_display_type', so the
    // operator's explicit choice is written last and wins.
    renderSection(<CurrencySection />)
    await settled(/Quota divisor/)

    fireEvent.click(screen.getByRole('switch', { name: /Show balances as money/ }))
    fireEvent.change(screen.getByLabelText(/Balance display/), { target: { value: 'CNY' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writtenKeys()).toEqual(['DisplayInCurrencyEnabled', 'general_setting.quota_display_type'])
    expect(server.stored['general_setting.quota_display_type']).toBe('CNY')
  })
})

describe('CheckinSection', () => {
  it('reads the string “false” as an off switch rather than as truthy', async () => {
    renderSection(<CheckinSection />)
    expect(await screen.findByRole('switch', { name: /Allow daily check-in/ })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(
      screen.getByText('Check-in is currently switched off, so nobody can claim these amounts.'),
    ).toBeInTheDocument()
  })

  it('rejects an inverted reward range, which the server stores without a word', async () => {
    renderSection(<CheckinSection />)
    await settled(/Largest reward/)

    fireEvent.change(screen.getByLabelText(/Largest reward/), { target: { value: '500' } })
    await save()

    expect(await screen.findByText('The maximum cannot be below the minimum.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('saves an equal minimum and maximum as a fixed reward', async () => {
    renderSection(<CheckinSection />)
    await settled(/Largest reward/)

    fireEvent.change(screen.getByLabelText(/Largest reward/), { target: { value: '1000' } })
    await save()
    await waitFor(() =>
      expect(writes()).toEqual([{ key: 'checkin_setting.max_quota', value: '1000' }]),
    )
  })
})

describe('ModelPricingSection', () => {
  it('joins the ten maps into one row per model and names the mode in force', async () => {
    renderSection(<ModelPricingSection />)

    const table = await screen.findByRole('table', { name: 'Configured model prices' })
    await waitFor(() => expect(within(table).getByText('dall-e-3')).toBeInTheDocument())
    expect(within(table).getByText('gpt-4-all')).toBeInTheDocument()
    expect(within(table).getByText('gpt-image-1')).toBeInTheDocument()
    expect(within(table).getByText('gpt-4o-audio-preview')).toBeInTheDocument()
    // dall-e-3 is the only model with a fixed ModelPrice, so it is the only per-request row.
    expect(within(table).getAllByText('Per request')).toHaveLength(1)
  })

  it('warns that a fixed price is silently beating the ratios it sits next to', async () => {
    server.stored.ModelPrice = '{"gpt-4-all":0.1}'
    renderSection(<ModelPricingSection />)

    expect(await screen.findByText(/model\(s\) have overlapping pricing/)).toBeInTheDocument()
  })

  it('blocks a save on a malformed blob, for the keys whose refusal corrupts the value', async () => {
    // ModelRatio is refused only AFTER the raw text has replaced the stored value, so an
    // unchecked write of "not json" destroys the price table it failed to change.
    renderSection(<ModelPricingSection />)
    fireEvent.click(await screen.findByText('Edit the raw pricing keys'))
    await settled('ModelRatio')

    fireEvent.change(screen.getByLabelText('ModelRatio'), { target: { value: 'not json' } })
    await save()

    // Twice: against the field itself, and in the section-level notice that names which
    // key is blocking — the raw blobs sit inside a collapsed panel, so the field's own
    // message can be off screen when the save silently refuses to run.
    expect(await screen.findAllByText('This is not valid JSON.')).toHaveLength(2)
    expect(screen.getByText('Raw pricing keys · ModelRatio')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('names the blocking key even when the raw editor was left collapsed', async () => {
    // The blob is edited with the panel open, then the operator collapses it and saves.
    // Without the notice the console would appear to ignore the button entirely.
    renderSection(<ModelPricingSection />)
    const summary = await screen.findByText('Edit the raw pricing keys')
    fireEvent.click(summary)
    await settled('ModelRatio')

    fireEvent.change(screen.getByLabelText('ModelRatio'), { target: { value: 'not json' } })
    fireEvent.click(summary)
    await save()

    expect(screen.getByText('Raw pricing keys · ModelRatio')).toBeInTheDocument()
    expect(screen.getByText(/Save is blocked by/)).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('blocks a ratio blob whose entries are not numbers', async () => {
    renderSection(<ModelPricingSection />)
    fireEvent.click(await screen.findByText('Edit the raw pricing keys'))
    await settled('ModelRatio')

    fireEvent.change(screen.getByLabelText('ModelRatio'), { target: { value: '{"gpt-4":"fifteen"}' } })
    await save()

    expect(
      await screen.findAllByText('Every entry must be a model name mapped to a number.'),
    ).toHaveLength(2)
    expect(writes()).toHaveLength(0)
  })

  it('names a servable model that nothing prices, and says what the gateway does about it', async () => {
    // dall-e-3 has a fixed ModelPrice and gpt-4-all a ModelRatio, so neither is unpriced;
    // a third live model with no entry anywhere is the one that matters.
    server.enabledModels = ['gpt-4-all', 'dall-e-3', 'gpt-5-preview']
    renderSection(<ModelPricingSection />)

    expect(await screen.findByText('gpt-5-preview')).toBeInTheDocument()
    expect(screen.getByText(/A request for one of them is refused/)).toBeInTheDocument()
    expect(screen.queryByText(/All 3 servable model/)).not.toBeInTheDocument()
  })

  it('opens the editor with the servable model’s own name, not a blank row', async () => {
    server.enabledModels = ['gpt-5-preview']
    renderSection(<ModelPricingSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Set a price for gpt-5-preview' }))

    // The label carries the required marker, so it reads "Model*" rather than "Model".
    const name = await screen.findByLabelText(/^Model\*$/)
    expect(name).toHaveValue('gpt-5-preview')
    // The gateway supplied the name, so it must not be retypeable into a different one.
    expect(name).toBeDisabled()
  })

  it('says everything is priced rather than showing an empty list', async () => {
    server.enabledModels = ['gpt-4-all', 'dall-e-3']
    renderSection(<ModelPricingSection />)

    expect(await screen.findByText(/All 2 servable model\(s\) have a base price\./)).toBeInTheDocument()
  })

  it('separates “no channel is enabled” from “everything is priced”', async () => {
    server.enabledModels = null
    renderSection(<ModelPricingSection />)

    expect(
      await screen.findByText(/No channel is enabled, so nothing is servable yet/),
    ).toBeInTheDocument()
  })

  it('keeps the pricing table working when the servable-model check is refused', async () => {
    // /api/channel/models_enabled is behind channel:read, which is separate from the root
    // gate the rest of this page sits behind. Losing it must not take the table with it.
    server.enabledModelsFails = true
    renderSection(<ModelPricingSection />)

    expect(await screen.findByText('no permission for channel')).toBeInTheDocument()
    expect(screen.getByText('dall-e-3')).toBeInTheDocument()
  })

  it('sorts the whole model list, not just the twenty rows on screen', async () => {
    // The table is fed one page at a time, so leaving the sort to the table would reverse
    // those twenty rows and leave the rest where they were — an order that looks sorted
    // and is not. With 25 models, descending must start at model-25, never at model-20.
    const many: Record<string, number> = {}
    for (let index = 1; index <= 25; index += 1) {
      many[`model-${String(index).padStart(2, '0')}`] = index
    }
    server.stored.ModelRatio = JSON.stringify(many)

    renderSection(<ModelPricingSection />)
    expect(await screen.findByText('model-01')).toBeInTheDocument()
    expect(screen.queryByText('model-25')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))

    expect(await screen.findByText('model-25')).toBeInTheDocument()
    expect(screen.queryByText('model-01')).not.toBeInTheDocument()
  })

  it('writes only the blob that changed, not all ten', async () => {
    renderSection(<ModelPricingSection />)
    fireEvent.click(await screen.findByText('Edit the raw pricing keys'))
    await settled('ModelRatio')

    fireEvent.change(screen.getByLabelText('ModelRatio'), { target: { value: '{"gpt-4-all":30}' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0].key).toBe('ModelRatio')
  })

  it('gates the server-side ratio reset behind typing the key name', async () => {
    // POST /api/option/rest_model_ratio replaces the whole ModelRatio map immediately,
    // with no save step and no undo.
    renderSection(<ModelPricingSection />)
    const trigger = await screen.findByRole('button', { name: 'Reset model ratios' })
    await waitFor(() => expect(trigger).toBeEnabled())
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Reset model ratios' })
    expect(confirm).toBeDisabled()

    // The gate only opens on the exact key name, so a mistyped one still cannot fire it.
    fireEvent.change(within(dialog).getByLabelText(/to confirm/), { target: { value: 'ModelPrice' } })
    expect(confirm).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText(/to confirm/), { target: { value: 'ModelRatio' } })
    expect(confirm).toBeEnabled()
    expect(post).not.toHaveBeenCalled()
  })
})

describe('GroupPricingSection', () => {
  it('shows a group that is priced but that no user can select', async () => {
    renderSection(<GroupPricingSection />)

    const table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).getByText('svip')).toBeInTheDocument())
    expect(within(table).getByRole('checkbox', { name: 'Users may select “vip”' })).toBeChecked()
    expect(
      within(table).getByRole('checkbox', { name: 'Users may select “svip”' }),
    ).not.toBeChecked()
  })

  it('writes only the group keys whose content actually changed', async () => {
    renderSection(<GroupPricingSection />)
    await settled('Billing multiplier for vip')

    fireEvent.change(screen.getByLabelText('Billing multiplier for vip'), { target: { value: '0.5' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'GroupRatio', value: '{"default":1,"svip":1,"vip":0.5}' })
  })

  it('refuses a negative multiplier before the server has to', async () => {
    renderSection(<GroupPricingSection />)
    await settled('Billing multiplier for vip')

    fireEvent.change(screen.getByLabelText('Billing multiplier for vip'), { target: { value: '-1' } })
    await save()

    expect(
      await screen.findByText(
        '“vip” has a negative multiplier. The server rejects a negative group ratio.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('blocks a malformed group-to-group blob, whose refusal corrupts the stored value', async () => {
    renderSection(<GroupPricingSection />)
    await settled('Billing multiplier for vip')

    fireEvent.change(screen.getByLabelText('Group-to-group overrides'), { target: { value: '[1,2]' } })
    await save()

    expect(await screen.findByText('This must be a JSON object.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('takes a group removal through a confirmation and holds it in the draft', async () => {
    renderSection(<GroupPricingSection />)
    await settled('Billing multiplier for vip')

    fireEvent.click(screen.getByRole('button', { name: 'Remove group svip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove group' }))

    // Nothing is written until the section is saved.
    expect(writes()).toHaveLength(0)
    await waitFor(() =>
      expect(screen.queryByLabelText('Billing multiplier for svip')).not.toBeInTheDocument(),
    )

    await save()
    await waitFor(() => expect(writes().length).toBeGreaterThan(0))
    expect(writes().find((write) => write.key === 'GroupRatio')?.value).toBe(
      '{"default":1,"vip":1}',
    )
  })
})

describe('PaymentSection', () => {
  it('shows the stored Waffo unit price rather than an empty box', async () => {
    // Regression: WaffoUnitPrice was declared in the draft type, validated and bound to
    // this input while `toDraft` never read it, so the field rendered blank against a
    // stored price. The draft is now a plain literal, and TypeScript catches the next one.
    renderSection(<PaymentSection />)
    await settled(/Minimum top-up/)

    fireEvent.click(screen.getByRole('tab', { name: 'Waffo' }))
    await settled('Waffo unit price')
    expect(screen.getByLabelText('Waffo unit price')).toHaveValue(3)
  })

  it('leaves the write-only credential boxes empty and writes nothing for an untouched one', async () => {
    // controller.GetOptions skips every key ending in Key/Secret, so they are ABSENT from
    // the payload rather than masked. An empty box therefore means "unknown", and an
    // untouched one must not write the empty string over a working credential.
    renderSection(<PaymentSection />)
    await settled(/Minimum top-up/)

    fireEvent.click(screen.getByRole('tab', { name: 'Stripe' }))
    // Exact, not a regex: the clear action's accessible name also names the credential.
    expect(await screen.findByLabelText('Stripe API secret')).toHaveValue('')

    fireEvent.change(screen.getByLabelText('Stripe price id'), { target: { value: 'price_123' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writtenKeys()).toEqual(['StripePriceId'])
  })

  it('writes a credential only once it has been typed into', async () => {
    renderSection(<PaymentSection />)
    await settled(/Minimum top-up/)

    fireEvent.click(screen.getByRole('tab', { name: 'Stripe' }))
    fireEvent.change(await screen.findByLabelText('Stripe API secret'), {
      target: { value: 'sk_live_example' },
    })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'StripeApiSecret', value: 'sk_live_example' })
  })

  it('blocks a numeric min_topup, the write that is refused after it destroys the list', async () => {
    renderSection(<PaymentSection />)
    await settled(/Minimum top-up/)

    fireEvent.change(screen.getByLabelText('Payment methods'), {
      target: { value: '[{"name":"probe","type":"alipay","min_topup":50}]' },
    })
    await save()

    expect(
      await screen.findAllByText(
        'Every value must be text, including min_topup. A number here is refused and destroys the stored list.',
      ),
    ).toHaveLength(2)
    expect(screen.getByText('General · Payment methods')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('rejects a fractional minimum, which the server silently stores as zero', async () => {
    // model/option.go reads MinTopUp with strconv.Atoi and discards the error.
    renderSection(<PaymentSection />)
    await settled(/Minimum top-up/)

    fireEvent.change(screen.getByLabelText(/Minimum top-up/), { target: { value: '2.5' } })
    await save()

    expect(
      await screen.findAllByText(
        'This must be a whole number. The server stores a fractional value as zero without saying so.',
      ),
    ).toHaveLength(2)
    expect(writes()).toHaveLength(0)
  })

  it('names the tab a blocking field is on, and switches to it on request', async () => {
    // Tabs.Panel unmounts the panel that is not showing. A bad Waffo unit price therefore
    // stops the save while its message is not rendered anywhere, which is indistinguishable
    // from a dead Save button unless the section says so itself.
    renderSection(<PaymentSection />)
    await settled(/Minimum top-up/)

    fireEvent.click(screen.getByRole('tab', { name: 'Waffo' }))
    fireEvent.change(await screen.findByLabelText('Waffo unit price'), { target: { value: '0' } })

    fireEvent.click(screen.getByRole('tab', { name: 'General' }))
    await waitFor(() => expect(screen.queryByLabelText('Waffo unit price')).not.toBeInTheDocument())
    await save()

    expect(writes()).toHaveLength(0)
    const notice = screen.getByText('Waffo · Waffo unit price').closest('li')
    expect(notice).not.toBeNull()
    if (notice === null) return

    fireEvent.click(within(notice).getByRole('button', { name: 'Open Waffo · Waffo unit price' }))
    expect(await screen.findByLabelText('Waffo unit price')).toBeInTheDocument()
  })

  it('reads gateway readiness from the server rather than guessing it from the form', async () => {
    // Readiness depends on credentials this page cannot read back, so no honest badge can
    // be derived here. /api/user/topup/info answers it authoritatively.
    renderSection(<PaymentSection />)
    expect(await screen.findByText('Stripe is live')).toBeInTheDocument()
    expect(screen.getByText('Epay is off')).toBeInTheDocument()
  })

  it('offers a retry instead of a blank panel when the readiness check fails', async () => {
    server.topUpFails = true
    renderSection(<PaymentSection />)

    expect(await screen.findByText(/The readiness check could not be loaded/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('never offers to change the compliance record through the settings endpoint', async () => {
    // PUT /api/option/ refuses every payment_setting.compliance_* key outright, so this
    // section must not present one as editable.
    renderSection(<PaymentSection />)

    expect(await screen.findByText('Accepted')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Review and accept the terms' }),
    ).not.toBeInTheDocument()
  })

  it('sends the acceptance to its own endpoint, behind a typed confirmation', async () => {
    server.stored['payment_setting.compliance_confirmed'] = 'false'
    renderSection(<PaymentSection />)

    const trigger = await screen.findByRole('button', { name: 'Review and accept the terms' })
    await waitFor(() => expect(trigger).toBeEnabled())
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Accept the terms' })
    expect(confirm).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText(/to confirm/), { target: { value: 'I ACCEPT' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    // Its own endpoint — never PUT /api/option/, which refuses these five keys outright.
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/option/payment_compliance',
        { confirmed: true },
        expect.anything(),
      ),
    )
    expect(writtenKeys()).not.toContain('payment_setting.compliance_confirmed')
  })
})
