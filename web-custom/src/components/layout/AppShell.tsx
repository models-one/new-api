import { Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Sidebar } from '@/components/layout/Sidebar'
import { TopHeader } from '@/components/layout/TopHeader'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar onClose={() => setSidebarOpen(false)} open={sidebarOpen} />
      <div className="min-h-screen lg:ml-[248px]">
        <TopHeader
          onMenuClick={() => setSidebarOpen((open) => !open)}
          sidebarOpen={sidebarOpen}
        />
        <div className="settings-canvas min-h-[calc(100vh-4rem)]">
          <main className="mx-auto w-full max-w-[1440px] p-4 sm:p-6 lg:p-8 xl:p-10" id="main-content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
