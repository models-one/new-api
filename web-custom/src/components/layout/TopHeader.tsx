import BellIcon from 'lucide-react/dist/esm/icons/bell'
import MenuIcon from 'lucide-react/dist/esm/icons/menu'
import SearchIcon from 'lucide-react/dist/esm/icons/search'
import UserRoundIcon from 'lucide-react/dist/esm/icons/user-round'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/auth-store'

type TopHeaderProps = {
  sidebarOpen: boolean
  onMenuClick: () => void
}

export function TopHeader(props: TopHeaderProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const accountLabel = user?.display_name || user?.username || t('Account')

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface/90 px-4 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <Button
          aria-controls="app-sidebar"
          aria-expanded={props.sidebarOpen}
          aria-label={t('Open navigation')}
          className="size-10 px-0 lg:hidden"
          onClick={props.onMenuClick}
          variant="quiet"
        >
          <MenuIcon aria-hidden="true" />
        </Button>
        <nav aria-label={t('Resource links')} className="hidden items-center gap-6 sm:flex">
          <a className="text-sm font-medium text-muted transition-colors hover:text-foreground" href="#docs">
            {t('Docs')}
          </a>
          <a className="text-sm font-medium text-muted transition-colors hover:text-foreground" href="#support">
            {t('Support')}
          </a>
          <a className="text-sm font-medium text-muted transition-colors hover:text-foreground" href="#changelog">
            {t('Changelog')}
          </a>
        </nav>
      </div>

      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <label className="field relative hidden h-10 w-[clamp(180px,22vw,290px)] items-center md:flex">
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-muted" />
          <span className="sr-only">{t('Search console')}</span>
          <input
            aria-label={t('Search console')}
            className="h-full w-full bg-transparent pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted"
            placeholder={t('Search console')}
            type="search"
          />
        </label>
        <Button aria-label={t('Notifications')} className="size-10 px-0" title={t('Notifications')} variant="quiet">
          <BellIcon aria-hidden="true" />
        </Button>
        <Button aria-label={accountLabel} className="size-10 px-0" title={accountLabel} variant="quiet">
          <UserRoundIcon aria-hidden="true" />
        </Button>
      </div>
    </header>
  )
}
