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
import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { createMemoryHistory, createRootRoute, createRouter, RouterProvider } =
  await import('@tanstack/react-router')
const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const i18next = (await import('i18next')).default
const { initReactI18next } = await import('react-i18next')
await i18next.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})
const { Footer } = await import('../footer')
const { useSystemConfigStore } = await import('@/stores/system-config-store')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

async function renderFooter(footerHtml?: string) {
  useSystemConfigStore.getState().setConfig({
    systemName: 'Models.one',
    logo: '/logo.png',
    footerHtml,
  })

  const queryClient = new QueryClient()
  queryClient.setQueryData(['status'], {
    user_agreement_enabled: true,
    privacy_policy_enabled: true,
  })
  const rootRoute = createRootRoute({ component: Footer })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
  })

  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
      queryClient.clear()
    },
  }
}

describe('Footer customer support contact', () => {
  after(() => {
    domWindow.close()
  })

  test('shows the support email as a mail link in the standard footer', async () => {
    const rendered = await renderFooter()
    const supportLink = rendered.container.querySelector(
      'footer a[href="mailto:support@models.one"]'
    )

    assert.ok(supportLink)
    assert.equal(supportLink.textContent, 'support@models.one')
    await rendered.unmount()
  })

  test('shows the support email when custom footer HTML is configured', async () => {
    const rendered = await renderFooter('<span>Custom footer</span>')
    const supportLink = rendered.container.querySelector(
      'footer a[href="mailto:support@models.one"]'
    )

    assert.ok(supportLink)
    assert.equal(supportLink.textContent, 'support@models.one')
    await rendered.unmount()
  })
})
