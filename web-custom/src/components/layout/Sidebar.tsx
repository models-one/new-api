import type { ComponentType, SVGProps } from 'react'
import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import BarChart3Icon from 'lucide-react/dist/esm/icons/chart-no-axes-column-increasing'
import CircleHelpIcon from 'lucide-react/dist/esm/icons/circle-help'
import CreditCardIcon from 'lucide-react/dist/esm/icons/credit-card'
import FileClockIcon from 'lucide-react/dist/esm/icons/file-clock'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import LayoutDashboardIcon from 'lucide-react/dist/esm/icons/layout-dashboard'
import LogOutIcon from 'lucide-react/dist/esm/icons/log-out'
import LayersIcon from 'lucide-react/dist/esm/icons/layers'
import NetworkIcon from 'lucide-react/dist/esm/icons/network'
import TicketIcon from 'lucide-react/dist/esm/icons/ticket'
import UserRoundIcon from 'lucide-react/dist/esm/icons/user-round'
import UsersIcon from 'lucide-react/dist/esm/icons/users'
import ChartPieIcon from 'lucide-react/dist/esm/icons/chart-pie'
import ImageIcon from 'lucide-react/dist/esm/icons/image'
import ListChecksIcon from 'lucide-react/dist/esm/icons/list-checks'
import MessagesSquareIcon from 'lucide-react/dist/esm/icons/messages-square'
import ServerIcon from 'lucide-react/dist/esm/icons/server'
import UsersRoundIcon from 'lucide-react/dist/esm/icons/users-round'
import WaypointsIcon from 'lucide-react/dist/esm/icons/waypoints'
import PlugZapIcon from 'lucide-react/dist/esm/icons/plug-zap'
import SlidersHorizontalIcon from 'lucide-react/dist/esm/icons/sliders-horizontal'
import XIcon from 'lucide-react/dist/esm/icons/x'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { logout } from '@/features/auth/api'
import { selfUserQuery } from '@/lib/api/user'
import { getLegacySignInHref, isPreviewMode } from '@/lib/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

type NavigationIcon = ComponentType<SVGProps<SVGSVGElement>>

type NavigationItem = {
  labelKey: string
  to: string
  icon: NavigationIcon
  /** Hidden below `common.RoleAdminUser`. The server refuses regardless; this only keeps
   *  a link out of sight that would land the user on a denial. */
  adminOnly?: boolean
}

/** `common.RoleAdminUser` (common/constants.go) — the floor `middleware.AdminAuth()` allows. */
const ADMIN_ROLE = 10

const primaryNavigation: NavigationItem[] = [
  { labelKey: 'Dashboard', to: '/dashboard', icon: LayoutDashboardIcon },
  { labelKey: 'API Keys', to: '/settings', icon: KeyRoundIcon },
  { labelKey: 'Models', to: '/models', icon: NetworkIcon },
  { labelKey: 'Usage', to: '/usage', icon: ActivityIcon },
  { labelKey: 'Analytics', to: '/analytics', icon: BarChart3Icon },
  { labelKey: 'Traffic flow', to: '/dashboard/flow', icon: WaypointsIcon },
  { labelKey: 'Playground', to: '/playground', icon: MessagesSquareIcon },
]

const workspaceNavigation: NavigationItem[] = [
  { labelKey: 'API Logs', to: '/logs', icon: FileClockIcon },
  // URL kept as /organization: router/web-router.go only serves this console for a fixed
  // path whitelist, and /referral is not on it yet.
  { labelKey: 'Referrals', to: '/organization', icon: UsersIcon },
  { labelKey: 'Wallet', to: '/wallet', icon: CreditCardIcon },
  { labelKey: 'Drawing tasks', to: '/usage-logs/drawing', icon: ImageIcon },
  { labelKey: 'Async tasks', to: '/usage-logs/task', icon: ListChecksIcon },
  { labelKey: 'Account', to: '/profile', icon: UserRoundIcon },
]

const administrationNavigation: NavigationItem[] = [
  { labelKey: 'Users', to: '/users', icon: UsersRoundIcon, adminOnly: true },
  { labelKey: 'Channels', to: '/channels', icon: PlugZapIcon, adminOnly: true },
  { labelKey: 'User analytics', to: '/dashboard/users', icon: ChartPieIcon, adminOnly: true },
  { labelKey: 'Redemption codes', to: '/redemption-codes', icon: TicketIcon, adminOnly: true },
  { labelKey: 'Subscription plans', to: '/subscriptions', icon: LayersIcon, adminOnly: true },
  { labelKey: 'Deployment health', to: '/system-info', icon: ServerIcon, adminOnly: true },
  {
    labelKey: 'System settings',
    to: '/system-settings/site/system-info',
    icon: SlidersHorizontalIcon,
    adminOnly: true,
  },
]

type SidebarProps = {
  open: boolean
  onClose: () => void
}

function NavigationLink(props: { item: NavigationItem; active: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  const Icon = props.item.icon

  return (
    <Link
      aria-current={props.active ? 'page' : undefined}
      className={cn(
        'flex min-h-10 items-center gap-3 rounded-[4px] border border-transparent px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-high hover:text-foreground',
        props.active && 'border-primary/25 bg-primary/10 text-primary',
      )}
      onClick={props.onClick}
      to={props.item.to}
    >
      <Icon aria-hidden="true" className="size-[18px] shrink-0" />
      <span>{t(props.item.labelKey)}</span>
    </Link>
  )
}

export function Sidebar(props: SidebarProps) {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const logoutMutation = useMutation({ mutationFn: logout })

  // The role rides on the sign-in bundle whenever this SPA performed the login; a cold
  // load (hard refresh, bookmark) has only the session cookie, so `/api/user/self` fills
  // the gap. It is the query the console already caches.
  const storedRole = useAuthStore((state) => state.auth.user?.role)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedRole === undefined })
  const role = storedRole ?? selfQuery.data?.role
  const visibleAdministration = administrationNavigation.filter(
    (item) => !item.adminOnly || (role !== undefined && role >= ADMIN_ROLE),
  )

  // `/profile` owns three sibling routes, so its entry stays lit on all of them.
  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/')

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
    <>
      <button
        aria-label={t('Close navigation')}
        className={cn(
          'fixed inset-0 z-40 bg-black/70 transition-opacity lg:hidden',
          props.open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={props.onClose}
        type="button"
      />
      <aside
        aria-label={t('Primary navigation')}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-border bg-sidebar px-4 py-4 transition-transform lg:translate-x-0',
          props.open ? 'translate-x-0' : '-translate-x-full',
        )}
        id="app-sidebar"
      >
        <div className="flex min-h-14 items-center justify-between px-2">
          <Link className="flex min-w-0 items-center gap-3" onClick={props.onClose} to="/dashboard">
            <span className="grid size-9 shrink-0 place-items-center rounded-[4px] border border-primary/30 bg-primary/10 text-primary">
              <NetworkIcon aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold text-primary">Models.one</span>
              <span className="block truncate text-xs font-medium text-muted">{t('API Gateway')}</span>
            </span>
          </Link>
          <Button
            aria-label={t('Close navigation')}
            className="size-9 min-h-9 px-0 lg:hidden"
            onClick={props.onClose}
            variant="quiet"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>

        <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto" aria-label={t('Console sections')}>
          <div className="flex flex-col gap-1">
            {primaryNavigation.map((item) => (
              <NavigationLink
                active={isActive(item.to)}
                item={item}
                key={item.to}
                onClick={props.onClose}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <p className="eyebrow px-3">{t('Workspace')}</p>
            <div className="flex flex-col gap-1">
              {workspaceNavigation.map((item) => (
                <NavigationLink
                  active={isActive(item.to)}
                  item={item}
                  key={item.to}
                  onClick={props.onClose}
                />
              ))}
            </div>
          </div>

          {visibleAdministration.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="eyebrow px-3">{t('Administration')}</p>
              <div className="flex flex-col gap-1">
                {visibleAdministration.map((item) => (
                  <NavigationLink
                    active={isActive(item.to)}
                    item={item}
                    key={item.to}
                    onClick={props.onClose}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
          <Button className="w-full" variant="outline">
            {t('Upgrade to Pro')}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="quiet">
              <CircleHelpIcon aria-hidden="true" />
              {t('Help')}
            </Button>
            <Button aria-busy={logoutMutation.isPending} disabled={logoutMutation.isPending} onClick={handleLogout} variant="quiet">
              <LogOutIcon aria-hidden="true" />
              {t('Logout')}
            </Button>
          </div>
        </div>
      </aside>
    </>
  )
}
