import '@fontsource-variable/public-sans'
import '@/styles/index.css'
import '@/i18n/config'

import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AppProviders } from '@/components/system/AppProviders'
import { queryClient } from '@/lib/query-client'
import { isDesignPreview } from '@/lib/design-preview'
import { router } from '@/routes'

async function bootstrap() {
  if (import.meta.env.DEV && isDesignPreview) {
    const { installModelLibraryPreview } = await import('@/dev/model-library-preview')
    installModelLibraryPreview()
  }
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
}

void bootstrap()
