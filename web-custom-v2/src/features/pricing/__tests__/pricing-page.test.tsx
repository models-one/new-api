// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PricingPage } from '@/features/pricing/PricingPage'
import { getJson, getRawJson } from '@/lib/api/client'
import type { PricingModel, PricingResponse } from '@/lib/api/pricing'

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to?: string
  params?: Record<string, string>
  activeProps?: unknown
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, activeProps: _activeProps, children, ...rest }: LinkProps) => (
    <a href={params ? `${to}/${Object.values(params).join('/')}` : to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  deleteJson: vi.fn(),
  getJson: vi.fn(),
  getRawJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
}))

const mockedGetJson = vi.mocked(getJson)
const mockedGetRawJson = vi.mocked(getRawJson)

/** Field for field the rows a live `GET /api/pricing` returned from the seeded backend. */
const tokenModel: PricingModel = {
  model_name: 'gpt-4o-mini',
  vendor_id: 1,
  quota_type: 0,
  model_ratio: 0.075,
  model_price: 0,
  owner_by: '',
  completion_ratio: 4,
  cache_ratio: 0.5,
  enable_groups: ['default', 'vip'],
  supported_endpoint_types: ['openai'],
}

const perRequestModel: PricingModel = {
  model_name: 'mj_imagine',
  quota_type: 1,
  model_ratio: 0,
  model_price: 0.1,
  owner_by: '',
  completion_ratio: 0,
  enable_groups: ['default'],
  supported_endpoint_types: ['openai'],
}

const tieredModel: PricingModel = {
  ...tokenModel,
  model_name: 'gemini-2.5-pro',
  billing_mode: 'tiered_expr',
  billing_expr: 'tier("base", p * 1.25 + c * 10)',
}

function buildPayload(models: PricingModel[]): PricingResponse {
  return {
    success: true,
    data: models,
    group_ratio: { default: 1, vip: 2 },
    usable_group: { default: '默认分组', vip: 'vip分组' },
    auto_groups: ['default'],
    supported_endpoint: {
      openai: { path: '/v1/chat/completions', method: 'POST' },
      'image-generation': { path: '/v1/images/generations', method: 'POST' },
    },
    vendors: [{ id: 1, name: 'OpenAI', icon: 'OpenAI' }],
  }
}

/** Every URL the page is allowed to reach, so an unexpected call fails loudly. */
function respondWith(options: {
  models?: PricingModel[]
  headerNavModules?: unknown
  pricingError?: Error
}) {
  mockedGetJson.mockImplementation(async (url) => {
    if (url === '/api/status') {
      return { HeaderNavModules: options.headerNavModules ?? '' } as never
    }
    if (url === '/api/perf-metrics/summary') return { models: [] } as never
    throw new Error(`unexpected url ${url}`)
  })
  mockedGetRawJson.mockImplementation(async (url) => {
    if (url !== '/api/pricing') throw new Error(`unexpected url ${url}`)
    if (options.pricingError) throw options.pricingError
    return buildPayload(options.models ?? []) as never
  })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  })
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
  )
  return render(<PricingPage />, { wrapper })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PricingPage', () => {
  it('prices token models per million and flat models per request for an anonymous visitor', async () => {
    respondWith({ models: [tokenModel, perRequestModel] })
    renderPage()

    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument()
    // model_ratio 0.075 * 2 * the cheapest enabled group ratio (default = 1), completion_ratio 4.
    expect(screen.getByText('$0.15')).toBeInTheDocument()
    expect(screen.getByText('$0.60')).toBeInTheDocument()

    // quota_type 1: model_price is the whole charge and model_ratio means nothing.
    const flatCard = screen.getByRole('heading', { name: 'mj_imagine' }).closest('article')
    expect(flatCard).not.toBeNull()
    expect(within(flatCard as HTMLElement).getByText('Per request')).toBeInTheDocument()
    expect(within(flatCard as HTMLElement).getByText('$0.10')).toBeInTheDocument()
    expect(within(flatCard as HTMLElement).queryByText('Input per 1M')).not.toBeInTheDocument()

    // Nothing authenticated may be requested to render the public page.
    const requested = mockedGetJson.mock.calls.map((call) => call[0])
    expect(requested).not.toContain('/api/user/self')
    expect(requested).not.toContain('/api/token/')
  })

  it('flags tiered models instead of printing the fallback ratio as the rate', async () => {
    respondWith({ models: [tieredModel] })
    renderPage()

    expect(await screen.findByText('Tiered pricing')).toBeInTheDocument()
    // 0.075 * 2 would render as $0.15; that number must never stand in for a tiered rate.
    expect(screen.queryByText('$0.15')).not.toBeInTheDocument()
    expect(
      screen.getByText('The rate changes with the request; 1 tiers are published.'),
    ).toBeInTheDocument()
  })

  it('rescales every price when another pricing group is selected', async () => {
    respondWith({ models: [tokenModel] })
    renderPage()

    expect(await screen.findByText('$0.15')).toBeInTheDocument()
    expect(screen.getByText('Best available group: default')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Pricing group'), { target: { value: 'vip' } })
    await waitFor(() => expect(screen.getByText('$0.30')).toBeInTheDocument())
    expect(screen.getByText('Priced for group vip')).toBeInTheDocument()
    expect(screen.queryByText('$0.15')).not.toBeInTheDocument()
  })

  it('hides a model that is not enabled for the selected group', async () => {
    respondWith({ models: [tokenModel, perRequestModel] })
    renderPage()

    expect(await screen.findByText('mj_imagine')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Pricing group'), { target: { value: 'vip' } })

    await waitFor(() => expect(screen.queryByText('mj_imagine')).not.toBeInTheDocument())
    expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument()
  })

  it('shows an empty state when the gateway publishes no pricing rows', async () => {
    respondWith({ models: [] })
    renderPage()

    expect(await screen.findByText('No models are published yet')).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
  })

  it('renders nothing pricing-shaped while /api/status is still pending', () => {
    mockedGetJson.mockImplementation(() => new Promise(() => undefined))
    mockedGetRawJson.mockImplementation(() => new Promise(() => undefined))
    renderPage()

    expect(screen.getByText('Loading the model catalogue')).toBeInTheDocument()
    expect(screen.queryByLabelText('Pricing group')).not.toBeInTheDocument()
    expect(mockedGetRawJson).not.toHaveBeenCalled()
  })

  it('does not request pricing at all when the module is turned off', async () => {
    respondWith({ models: [tokenModel], headerNavModules: JSON.stringify({ pricing: false }) })
    renderPage()

    expect(await screen.findByText('Pricing is not published here')).toBeInTheDocument()
    expect(mockedGetRawJson).not.toHaveBeenCalled()
  })

  it('offers a sign-in link when the module is configured to require authentication', async () => {
    respondWith({
      headerNavModules: JSON.stringify({ pricing: { enabled: true, requireAuth: true } }),
      pricingError: new Error('unauthorized'),
    })
    renderPage()

    expect(await screen.findByText('Sign in to see pricing')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('offers a retry when the catalogue request fails on a public instance', async () => {
    respondWith({ pricingError: new Error('network down') })
    renderPage()

    expect(await screen.findByText('Could not load the model catalogue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('pages the grid instead of rendering the whole catalogue at once', async () => {
    const many = Array.from({ length: 14 }, (_unused, index) => ({
      ...tokenModel,
      model_name: `model-${String(index + 1).padStart(2, '0')}`,
    }))
    respondWith({ models: many })
    renderPage()

    expect(await screen.findByText('model-01')).toBeInTheDocument()
    expect(screen.getByText('model-12')).toBeInTheDocument()
    expect(screen.queryByText('model-13')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() => expect(screen.getByText('model-13')).toBeInTheDocument())
    expect(screen.queryByText('model-01')).not.toBeInTheDocument()
  })

  it('filters in the browser and never invents attributes the payload lacks', async () => {
    respondWith({ models: [tokenModel, perRequestModel] })
    renderPage()

    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument()
    // The seeded rows carry no tags and no description, so no such section may appear.
    expect(screen.queryByText('Tags')).not.toBeInTheDocument()
    expect(screen.queryByText('Context window')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'mj' } })
    await waitFor(() => expect(screen.queryByText('gpt-4o-mini')).not.toBeInTheDocument())
    expect(screen.getByText('mj_imagine')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    await waitFor(() => expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument())
  })

  it('narrows the catalogue by billing type, counting what the toggle would show', async () => {
    respondWith({ models: [tokenModel, perRequestModel] })
    renderPage()

    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument()

    const billingType = screen.getByRole('group', { name: 'Billing type' })
    // The toggle counts what each branch would leave standing: one of each shape.
    expect(within(billingType).getByRole('button', { name: /^Token-based/ })).toHaveTextContent('1')
    fireEvent.click(within(billingType).getByRole('button', { name: /^Per request/ }))

    await waitFor(() => expect(screen.queryByText('gpt-4o-mini')).not.toBeInTheDocument())
    expect(screen.getByText('mj_imagine')).toBeInTheDocument()
  })
})
