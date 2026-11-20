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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { ArtifactImage } from '../artwork'
import { PelicanGallery } from '../gallery'
import { RuleEditor } from '../rule-editor'
import { defaultRule, type PelicanArtwork } from '../types'

const i18n = createInstance()
await i18n.init({
  lng: 'en',
  resources: { en: { translation: {} } },
  initAsync: false,
})
const clients: QueryClient[] = []
const NativeURL = globalThis.URL
const previousAuth = useAuthStore.getState().auth

function artwork(id: string, channel: string): PelicanArtwork {
  return {
    id,
    channel_name: channel,
    model: 'fixture-model',
    protocol: 'openai-responses',
    revision: 1,
    generated_at: 1700000000,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    prompt: 'Draw a pelican',
    system_prompt: '',
    parameters: '{}',
    generation: { duration_ms: 1234 },
    artifacts: [
      { id: `art_${id}`, type: 'png', size: 8, sha256: 'fixture' },
      { id: `svg_${id}`, type: 'svg', size: 8, sha256: 'fixture' },
    ],
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL() {
        return 'blob:fixture-image'
      }
      static revokeObjectURL() {}
    }
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [
            {
              isIntersecting: true,
              intersectionRatio: 1,
              target,
            } as IntersectionObserverEntry,
          ],
          this as unknown as IntersectionObserver
        )
      }
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
    }
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  )
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  useAuthStore.setState({
    auth: {
      ...previousAuth,
      user: { id: 1, username: 'viewer', email: '', role: 1 },
    },
  })
})
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  useAuthStore.setState({ auth: previousAuth })
})

async function mount(component: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  const route = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>{component}</I18nextProvider>
      </QueryClientProvider>
    ),
  })
  const router = createRouter({
    routeTree: route,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await router.load()
}

it('shows channel/model groups and allows exactly two artworks to be compared', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/notice') return { data: { success: true, data: '' } }
    if (String(url).includes('/artifacts/')) {
      return { data: new Blob(['png'], { type: 'image/png' }) }
    }
    if (url === '/api/pelican/gallery') {
      return {
        data: {
          success: true,
          data: {
            page: 1,
            total: 2,
            groups: [
              {
                key: 'a',
                channel_id: 1,
                channel_name: 'Channel A',
                model: 'fixture-model',
                interval_seconds: 3600,
                latest_status: 'succeeded',
                latest_attempt_at: 1700000000,
                runs: [artwork('a1', 'Channel A'), artwork('a2', 'Channel A')],
              },
              {
                key: 'b',
                channel_id: 2,
                channel_name: 'Channel B',
                model: 'fixture-model',
                interval_seconds: 3600,
                latest_status: 'failed',
                latest_attempt_at: 1700000000,
                runs: [artwork('b1', 'Channel B')],
              },
            ],
          },
        },
      }
    }
    return { data: { success: true, data: {} } }
  })
  await mount(<PelicanGallery />)
  expect(
    await screen.findByRole('heading', { name: 'Channel A / fixture-model' })
  ).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Channel B / fixture-model' })
  ).toBeVisible()
  expect(
    screen.getByText(
      'Latest attempt did not finish successfully; previous artworks are shown'
    )
  ).toBeVisible()
  const user = userEvent.setup()
  const choices = screen.getAllByRole('checkbox')
  const [first, second, third] = choices
  if (!first || !second || !third) {
    throw new Error('Expected three artwork selectors')
  }
  await user.click(first)
  await user.click(third)
  expect(second).toHaveAttribute('aria-disabled', 'true')
  await user.click(second)
  expect(second).toHaveAttribute('aria-checked', 'false')
  await user.click(
    screen.getByRole('button', { name: 'Compare artworks (2/2)' })
  )
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('Channel A / fixture-model')).toBeVisible()
  expect(within(dialog).getByText('Channel B / fixture-model')).toBeVisible()
  await waitFor(() =>
    expect(
      get.mock.calls.some(
        ([url, options]) =>
          String(url).includes('/artifacts/') &&
          options?.responseType === 'blob'
      )
    ).toBe(true)
  )
})

it('an expired artwork is not fetched and shows an explicit unavailable state', async () => {
  const get = vi.spyOn(api, 'get')
  const run = {
    ...artwork('expired', 'Channel A'),
    expires_at: Math.floor(Date.now() / 1000) - 1,
  }
  await mount(<ArtifactImage run={run} large />)
  expect(
    await screen.findByText('Artwork is unavailable or expired')
  ).toBeVisible()
  expect(get).not.toHaveBeenCalled()
})

it('invalid rule parameters prevent saving and show a useful validation error', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url) =>
    url === '/api/channel/1'
      ? {
          data: {
            success: true,
            data: { id: 1, name: 'Channel A', models: 'fixture-model' },
          },
        }
      : { data: { success: true, data: { items: [] } } }
  )
  const save = vi.spyOn(api, 'put')
  await mount(
    <RuleEditor
      rule={{
        ...defaultRule,
        id: 1,
        revision: 1,
        name: 'Test',
        channel_id: 1,
        model: 'fixture-model',
        parameters: '{',
      }}
      onClose={() => {}}
    />
  )
  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement()
  expect(save).not.toHaveBeenCalled()
})
