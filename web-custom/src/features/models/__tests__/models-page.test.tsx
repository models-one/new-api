// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ModelsPage } from '@/features/models/ModelsPage'
import { getJson, getRawJson } from '@/lib/api/client'
import type { PricingModel, PricingResponse } from '@/lib/api/pricing'

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
  enable_groups: ['default'],
  supported_endpoint_types: ['openai'],
  pricing_version: '5a90f2b86c08bd983a9a2e6d66c255f4eaef9c4b',
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
  model_name: 'gemini-2.5-pro',
  quota_type: 0,
  model_ratio: 0.625,
  model_price: 0,
  owner_by: '',
  completion_ratio: 8,
  enable_groups: ['vip'],
  supported_endpoint_types: ['openai'],
  billing_mode: 'tiered_expr',
  billing_expr: 'prompt_tokens > 200000 ? 2.5 : 1.25',
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
    pricing_version: 'a42d372ccf0b5dd13ecf71203521f9d2',
  }
}

function respondWith(models: PricingModel[], selfGroup = 'default') {
  mockedGetRawJson.mockImplementation(async (url) => {
    if (url === '/api/pricing') return buildPayload(models) as never
    throw new Error(`unexpected url ${url}`)
  })
  mockedGetJson.mockImplementation(async (url) => {
    if (url === '/api/user/self') return { group: selfGroup } as never
    throw new Error(`unexpected url ${url}`)
  })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  })
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
  )
  return render(<ModelsPage />, { wrapper })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ModelsPage', () => {
  it('prices token models per million and flat models per request', async () => {
    respondWith([tokenModel, perRequestModel])
    renderPage()

    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument()
    // model_ratio 0.075 * 2 * group ratio 1, and its completion_ratio of 4.
    expect(screen.getByText('$0.15')).toBeInTheDocument()
    expect(screen.getByText('$0.60')).toBeInTheDocument()
    // quota_type 1: model_price is the whole charge, model_ratio is meaningless.
    expect(screen.getByText('mj_imagine')).toBeInTheDocument()
    expect(screen.getByText('$0.10')).toBeInTheDocument()
    expect(screen.getByText('Per request')).toBeInTheDocument()
  })

  it('defaults the pricing group to the account group and rescales on change', async () => {
    respondWith([tokenModel], 'vip')
    renderPage()

    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument()
    const select = screen.getByLabelText('Pricing group')
    expect(select).toHaveValue('vip')
    // vip carries group_ratio 2, so the base $0.15 doubles.
    expect(screen.getByText('$0.30')).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'default' } })
    await waitFor(() => expect(screen.getByText('$0.15')).toBeInTheDocument())
  })

  it('flags tiered models instead of showing the fallback ratio as the price', async () => {
    respondWith([tieredModel])
    renderPage()

    expect(await screen.findByText('Tiered pricing')).toBeInTheDocument()
    // 0.625 * 2 would render as $1.25; that number must never be presented as the price.
    expect(screen.queryByText('$1.25')).not.toBeInTheDocument()
  })

  it('shows an empty state when the gateway publishes no pricing rows', async () => {
    respondWith([])
    renderPage()

    expect(await screen.findByText('No models are published yet')).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
  })

  it('offers a retry when the catalogue request fails', async () => {
    mockedGetRawJson.mockRejectedValue(new Error('network down'))
    mockedGetJson.mockResolvedValue({ group: 'default' } as never)
    renderPage()

    expect(await screen.findByText('Could not load the model catalogue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('pages the grid instead of rendering the whole catalogue at once', async () => {
    const many = Array.from({ length: 12 }, (_unused, index) => ({
      ...tokenModel,
      model_name: `model-${String(index + 1).padStart(2, '0')}`,
    }))
    respondWith(many)
    renderPage()

    expect(await screen.findByText('model-01')).toBeInTheDocument()
    expect(screen.getByText('model-09')).toBeInTheDocument()
    expect(screen.queryByText('model-10')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() => expect(screen.getByText('model-10')).toBeInTheDocument())
    expect(screen.queryByText('model-01')).not.toBeInTheDocument()
  })

  it('compares at most two models at a time', async () => {
    respondWith([tokenModel, perRequestModel, { ...tokenModel, model_name: 'gpt-image-1' }])
    renderPage()

    const compareButtons = await screen.findAllByRole('button', { name: 'Compare' })
    fireEvent.click(compareButtons[0] as HTMLElement)
    fireEvent.click(screen.getAllByRole('button', { name: 'Compare' })[0] as HTMLElement)

    // Cards sort by name, so the first two picks are gpt-4o-mini and gpt-image-1.
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 3, name: 'gpt-4o-mini' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('heading', { level: 3, name: 'gpt-image-1' })).toBeInTheDocument()

    // A third pick drops the oldest rather than growing the panel.
    fireEvent.click(screen.getAllByRole('button', { name: 'Compare' })[0] as HTMLElement)
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 3, name: 'mj_imagine' })).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('heading', { level: 3, name: 'gpt-4o-mini' }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
  })

  it('filters the catalogue in the browser and never invents mock attributes', async () => {
    respondWith([tokenModel, perRequestModel])
    renderPage()

    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument()
    expect(screen.queryByText('Featured')).not.toBeInTheDocument()
    expect(screen.queryByText('Context window')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'mj' } })
    await waitFor(() => expect(screen.queryByText('gpt-4o-mini')).not.toBeInTheDocument())
    expect(screen.getByText('mj_imagine')).toBeInTheDocument()
  })
})
