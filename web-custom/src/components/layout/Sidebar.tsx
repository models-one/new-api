import type { ComponentType, SVGProps } from 'react'
import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import BarChart3Icon from 'lucide-react/dist/esm/icons/chart-no-axes-column-increasing'
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
import BoxesIcon from 'lucide-react/dist/esm/icons/boxes'
import CpuIcon from 'lucide-react/dist/esm/icons/cpu'
import XIcon from 'lucide-react/dist/esm/icons/x'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { logout } from '@/features/auth/api'
import { selfUserQuery } from '@/lib/api/user'
import { serverStatusQuery } from '@/lib/api/status'
import { getLegacySignInHref, isPreviewMode } from '@/lib/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

type NavigationIcon = ComponentType<SVGProps<SVGSVGElement>>

type NavigationItem = {
  labelKey: string
  to: string
  icon: NavigationIcon
  /**
   * Base path this entry owns, when it differs from `to`. `System settings` links straight
   * at a leaf section but owns every path under `/system-settings`, so a visitor landing on
   * the bare section-less URL still lights it up.
   */
  match?: string
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
  { labelKey: 'Model registry', to: '/models/metadata', icon: BoxesIcon, adminOnly: true },
  { labelKey: 'GPU deployments', to: '/models/deployments', icon: CpuIcon, adminOnly: true },
  { labelKey: 'User analytics', to: '/dashboard/users', icon: ChartPieIcon, adminOnly: true },
  { labelKey: 'Redemption codes', to: '/redemption-codes', icon: TicketIcon, adminOnly: true },
  { labelKey: 'Subscription plans', to: '/subscriptions', icon: LayersIcon, adminOnly: true },
  { labelKey: 'Deployment health', to: '/system-info', icon: ServerIcon, adminOnly: true },
  {
    labelKey: 'System settings',
    to: '/system-settings/site/system-info',
    match: '/system-settings',
    icon: SlidersHorizontalIcon,
    adminOnly: true,
  },
]

type SidebarProps = {
  open: boolean
  onClose: () => void
}

function navigationBase(item: NavigationItem): string {
  return item.match ?? item.to
}

/**
 * The single entry a path belongs to.
 *
 * Plain prefix matching lights two rows at once — `/dashboard/flow` sits under both
 * `Dashboard` and `Traffic flow`, `/models/metadata` under both `Models` and
 * `Model registry` — so the deepest matching base wins and everything else stays dark.
 */
function activeNavigationPath(pathname: string, items: readonly NavigationItem[]): string | undefined {
  let best: string | undefined
  for (const item of items) {
    const base = navigationBase(item)
    if (pathname !== base && !pathname.startsWith(base + '/')) continue
    if (best === undefined || base.length > best.length) best = base
  }
  return best
}

function NavigationLink(props: { item: NavigationItem; active: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  const Icon = props.item.icon

  return (
    <Link
      // The router's own active detection is prefix-based, so it marks `Dashboard`
      // current while the reader is on `/dashboard/flow` and two rows light up at once.
      // `exact` silences it; which single entry owns the path is decided above.
      activeOptions={{ exact: true }}
      aria-current={props.active ? 'page' : undefined}
      className={cn(
        'flex min-h-10 items-center gap-3 rounded-[4px] border border-transparent px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-high hover:text-foreground',
        props.active && 'border-nav-active bg-nav-active text-white hover:bg-nav-active hover:text-white',
      )}
      data-active={props.active ? 'true' : undefined}
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
  const statusQuery = useQuery(serverStatusQuery())

  // The role rides on the sign-in bundle whenever this SPA performed the login; a cold
  // load (hard refresh, bookmark) has only the session cookie, so `/api/user/self` fills
  // the gap. It is the query the console already caches.
  const storedUser = useAuthStore((state) => state.auth.user)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedUser === null })
  const role = storedUser?.role ?? selfQuery.data?.role
  const accountName =
    storedUser?.display_name || storedUser?.username ||
    selfQuery.data?.display_name || selfQuery.data?.username || ''
  const accountEmail = storedUser?.email ?? selfQuery.data?.email ?? ''
  const accountGroup = storedUser?.group ?? selfQuery.data?.group ?? ''

  const visibleAdministration = administrationNavigation.filter(
    (item) => !item.adminOnly || (role !== undefined && role >= ADMIN_ROLE),
  )
  const allItems = [...primaryNavigation, ...workspaceNavigation, ...visibleAdministration]
  const activePath = activeNavigationPath(pathname, allItems)
  const isActive = (item: NavigationItem) => navigationBase(item) === activePath

  // The operator's own name and mark, the way the sign-in page already shows them. A
  // console that says "Models.one" on a deployment branded something else is telling the
  // user they are on the wrong site.
  const systemName = statusQuery.data?.system_name?.trim()
  const logo = statusQuery.data?.logo?.trim()

  const navRef = useRef<HTMLElement | null>(null)
  const [hasMoreBelow, setHasMoreBelow] = useState(false)

  // 22 entries do not fit a laptop window, so the rail scrolls. Two things follow from
  // that: the entry for the current page has to be brought into view (otherwise an admin
  // route shows no active row at all), and the fact that there IS more below has to be
  // visible — macOS hides overlay scrollbars until you scroll, which turns a group
  // heading sitting on the fold into a heading with apparently nothing under it.
  useEffect(() => {
    const nav = navRef.current
    if (nav === null) return
    const updateOverflowHint = () => {
      setHasMoreBelow(nav.scrollTop + nav.clientHeight < nav.scrollHeight - 1)
    }
    const active = nav.querySelector('[data-active="true"]')
    if (active !== null) active.scrollIntoView({ block: 'nearest' })
    updateOverflowHint()
    nav.addEventListener('scroll', updateOverflowHint, { passive: true })
    const observer = new ResizeObserver(updateOverflowHint)
    observer.observe(nav)
    return () => {
      nav.removeEventListener('scroll', updateOverflowHint)
      observer.disconnect()
    }
  }, [activePath, visibleAdministration.length])

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
        <div className="flex min-h-16 shrink-0 items-center justify-between px-2">
          <Link className="flex min-w-0 items-center gap-3" onClick={props.onClose} to="/dashboard">
            {logo ? (
              <img alt="" className="size-9 shrink-0 rounded-[4px] object-cover" src={logo} />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-[4px] border border-primary/30 bg-primary/10 text-primary">
                <NetworkIcon aria-hidden="true" className="size-5" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold text-primary">
                {systemName === undefined || systemName === '' ? t('Console') : systemName}
              </span>
              <span className="block truncate text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
                {t('API Gateway')}
              </span>
            </span>
          </Link>
          <Button
            aria-label={t('Close navigation')}
            className="lg:hidden"
            onClick={props.onClose}
            size="icon-md"
            variant="quiet"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>

        <div className="relative min-h-0 flex-1">
          <nav
            aria-label={t('Console sections')}
            className="sidebar-scroll flex h-full flex-col gap-6 overflow-y-auto pt-6 pb-2"
            ref={navRef}
          >
            <div className="flex flex-col gap-1">
              {primaryNavigation.map((item) => (
                <NavigationLink
                  active={isActive(item)}
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
                    active={isActive(item)}
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
                      active={isActive(item)}
                      item={item}
                      key={item.to}
                      onClick={props.onClose}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </nav>
          {hasMoreBelow ? (
            // Darkens the bottom edge. Fading to the rail's OWN colour, which is what this
            // did first, paints the rail onto the rail and shows nothing at all.
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/85 to-transparent"
            />
          ) : null}
        </div>

        <div className="mt-4 flex shrink-0 items-center gap-3 border-t border-border pt-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-high text-xs font-bold text-foreground">
            {accountName.slice(0, 2).toUpperCase() || '—'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">
              {accountName === '' ? t('Account') : accountName}
            </span>
            <span className="block truncate text-xs text-muted">
              {accountEmail === '' ? accountGroup : accountEmail}
            </span>
          </span>
          <Button
            aria-busy={logoutMutation.isPending}
            aria-label={t('Logout')}
            disabled={logoutMutation.isPending}
            onClick={handleLogout}
            size="icon-md"
            title={t('Logout')}
            variant="quiet"
          >
            <LogOutIcon aria-hidden="true" />
          </Button>
        </div>
      </aside>
    </>
  )
}
