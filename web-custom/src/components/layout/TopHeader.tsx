import BookOpenIcon from 'lucide-react/dist/esm/icons/book-open'
import LogOutIcon from 'lucide-react/dist/esm/icons/log-out'
import MenuIcon from 'lucide-react/dist/esm/icons/menu'
import UserRoundIcon from 'lucide-react/dist/esm/icons/user-round'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DropdownMenu } from '@/components/overlay/DropdownMenu'
import { Button } from '@/components/ui/Button'
import { logout } from '@/features/auth/api'
import { serverStatusQuery } from '@/lib/api/status'
import { selfUserQuery } from '@/lib/api/user'
import { getLegacySignInHref, isPreviewMode } from '@/lib/navigation'
import { useAuthStore } from '@/stores/auth-store'

type TopHeaderProps = {
  sidebarOpen: boolean
  onMenuClick: () => void
}

/**
 * The console's top bar.
 *
 * It carries only controls that do something. The documentation link is the operator's
 * own `docs_link` from `GET /api/status` and disappears when they have not set one;
 * everything else here is the account menu. Resist re-adding decorative Search /
 * Notifications / Changelog affordances until a server route exists behind them — an
 * enabled control that ignores the click is worse than no control.
 */
export function TopHeader(props: TopHeaderProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const statusQuery = useQuery(serverStatusQuery())
  const logoutMutation = useMutation({ mutationFn: logout })

  const storedUser = useAuthStore((state) => state.auth.user)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedUser === null })
  const accountName =
    storedUser?.display_name || storedUser?.username ||
    selfQuery.data?.display_name || selfQuery.data?.username || ''
  const accountEmail = storedUser?.email ?? selfQuery.data?.email ?? ''
  const accountLabel = accountName === '' ? t('Account') : accountName

  const docsLink = statusQuery.data?.docs_link?.trim() ?? ''

  const handleLogout = () => {
    if (isPreviewMode()) {
      window.location.assign('/')
      return
    }
    logoutMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.success) window.location.assign(getLegacySignInHref())
      },
    })
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface/90 px-4 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <Button
          aria-controls="app-sidebar"
          aria-expanded={props.sidebarOpen}
          aria-label={t('Open navigation')}
          className="lg:hidden"
          onClick={props.onMenuClick}
          size="icon-lg"
          variant="quiet"
        >
          <MenuIcon aria-hidden="true" />
        </Button>
        {docsLink === '' ? null : (
          <a
            className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground [&_svg]:size-4"
            href={docsLink}
            rel="noreferrer"
            target="_blank"
          >
            <BookOpenIcon aria-hidden="true" />
            {t('Docs')}
          </a>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <span className="hidden min-w-0 flex-col text-right sm:flex">
          <span className="truncate text-sm font-semibold text-foreground">{accountLabel}</span>
          {accountEmail === '' ? null : (
            <span className="truncate text-xs text-muted">{accountEmail}</span>
          )}
        </span>
        <DropdownMenu
          align="end"
          items={[
            {
              id: 'account',
              icon: <UserRoundIcon aria-hidden="true" />,
              label: t('Account'),
              onSelect: () => void navigate({ to: '/profile' }),
            },
            {
              id: 'logout',
              destructive: true,
              icon: <LogOutIcon aria-hidden="true" />,
              label: t('Logout'),
              separatorBefore: true,
              onSelect: handleLogout,
            },
          ]}
          label={t('Account menu')}
          trigger={
            <Button aria-label={accountLabel} size="icon-lg" title={accountLabel} variant="quiet">
              <UserRoundIcon aria-hidden="true" />
            </Button>
          }
        />
      </div>
    </header>
  )
}
