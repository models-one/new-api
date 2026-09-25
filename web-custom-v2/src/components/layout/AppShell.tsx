import { Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Sidebar } from '@/components/layout/Sidebar'
import { TopHeader } from '@/components/layout/TopHeader'
import { isDesignPreview } from '@/lib/design-preview'

export function AppShell() {
  const { t } = useTranslation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar onClose={() => setSidebarOpen(false)} open={sidebarOpen} />
      <div className="min-h-screen lg:ml-[228px]">
        <TopHeader onMenuClick={() => setSidebarOpen((open) => !open)} sidebarOpen={sidebarOpen} />
        <div className="settings-canvas min-h-[calc(100vh-3.25rem)]">
          <main className="mx-auto w-full max-w-[1720px] p-4 sm:p-6 lg:p-7" id="main-content">
            {isDesignPreview ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-primary/80">
                <span>{t('Design preview · sample models and prices')}</span>
                <a className="underline underline-offset-4" href="/models">
                  {t('Open live mode')}
                </a>
              </div>
            ) : null}
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
