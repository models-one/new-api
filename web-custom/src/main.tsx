import '@fontsource-variable/public-sans'
import '@/styles/index.css'
import '@/i18n/config'

import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AppProviders } from '@/components/system/AppProviders'
import { queryClient } from '@/lib/query-client'
import { router } from '@/routes'

const rootElement = document.querySelector('#root')

if (!rootElement) {
  throw new Error('Root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider context={{ queryClient }} router={router} />
    </AppProviders>
  </StrictMode>,
)
