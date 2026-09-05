import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

import { AppShell } from '@/components/layout/AppShell'
import { NotFoundPage } from '@/components/system/NotFoundPage'
import { RouteErrorPage } from '@/components/system/RouteErrorPage'
import { RouteLoading } from '@/components/system/RouteLoading'
import {
  signInSearchSchema,
  skipSignInWhenAuthenticated,
} from '@/features/auth/sign-in/route-guard'
import { readPending2FAChallenge } from '@/features/auth/otp/pending-2fa'
import { validateResetSearch } from '@/features/auth/password-reset/route-guard'
import { passThroughSearch, skipSignUpWhenAuthenticated } from '@/features/auth/sign-up/route-guard'
import { setupStatusQuery } from '@/features/setup/api'
import { requireConsoleAuthentication } from '@/lib/console-auth-guard'
import { queryClient } from '@/lib/query-client'

type RouterContext = {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  errorComponent: RouteErrorPage,
  notFoundComponent: NotFoundPage,
})

/**
 * `/` renders the admin-configured home page from `GET /api/home_page_content` when the
 * operator has set one, and the Models.one landing page otherwise. `HomePage` owns that
 * decision; the marketing page itself is untouched and still lives in `features/landing`.
 */
const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('@/features/content/HomePage'), 'HomePage'),
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: lazyRouteComponent(() => import('@/features/content/AboutPage'), 'AboutPage'),
})

const privacyPolicyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy-policy',
  component: lazyRouteComponent(
    () => import('@/features/content/PrivacyPolicyPage'),
    'PrivacyPolicyPage',
  ),
})

const userAgreementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/user-agreement',
  component: lazyRouteComponent(
    () => import('@/features/content/UserAgreementPage'),
    'UserAgreementPage',
  ),
})

/**
 * Registration and password reset.
 *
 * All five are public — they are the pages an anonymous visitor needs — so they hang off
 * `rootRoute` rather than `consoleRoute`, whose `beforeLoad` would bounce a signed-out
 * visitor straight back to sign-in.
 *
 * `router/web-router.go` must gain `/sign-up`, `/register`, `/forgot-password`, `/reset`
 * and `/user/reset` before a hard refresh (or the link in a password-reset e-mail, which
 * lands on `/user/reset` cold) reaches these pages in production. Until then a reload
 * falls through to the legacy frontend, which still serves the same flows.
 */
const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-up',
  validateSearch: passThroughSearch,
  beforeLoad: skipSignUpWhenAuthenticated,
  component: lazyRouteComponent(() => import('@/features/auth/sign-up/SignUpPage'), 'SignUpPage'),
})

/**
 * `/register` is the legacy URL that referral links point at. It only forwards, and it
 * forwards the WHOLE query string: dropping it here would silently discard the `?aff=`
 * code before `/sign-up` ever gets a chance to persist it.
 */
const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  validateSearch: passThroughSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ replace: true, search, to: '/sign-up' })
  },
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: lazyRouteComponent(
    () => import('@/features/auth/password-reset/ForgotPasswordPage'),
    'ForgotPasswordPage',
  ),
})

/**
 * Two mount points for one component. `controller/misc.go#SendPasswordResetEmail` builds
 * the e-mailed link as `<server>/user/reset?email=…&token=…`, so that path is the one that
 * has to work; `/reset` is kept because the legacy console answered it too and older
 * e-mails are still in inboxes.
 */
const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset',
  validateSearch: validateResetSearch,
  component: lazyRouteComponent(
    () => import('@/features/auth/password-reset/ResetPasswordRoute'),
    'ResetPasswordRoute',
  ),
})

const userResetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/user/reset',
  validateSearch: validateResetSearch,
  component: lazyRouteComponent(
    () => import('@/features/auth/password-reset/ResetPasswordRoute'),
    'ResetPasswordRoute',
  ),
})

/**
 * The installer is reachable only while the instance is uninitialized. `GET /api/setup`
 * answering `status: true` means installation already happened, so the route redirects
 * home before the wizard can render. A request failure does NOT redirect: the page renders
 * its own error state instead of silently bouncing the operator off the installer.
 */
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  beforeLoad: async ({ context }) => {
    const status = await context.queryClient.fetchQuery(setupStatusQuery()).catch(() => null)
    if (status?.status === true) throw redirect({ to: '/' })
  },
  component: lazyRouteComponent(() => import('@/features/setup/SetupPage'), 'SetupPage'),
})

/**
 * The sign-in surface. Public, and outside `consoleRoute` for the obvious reason.
 *
 * `?redirect=` is validated as a string here and sanitized wherever it is used — the
 * page never navigates to the raw parameter. `beforeLoad` skips the page for a visitor
 * who already holds a session in this SPA instance.
 *
 * `router/web-router.go` must gain `/sign-in` before a hard refresh works in production;
 * without it a reload falls through to the legacy sign-in page.
 */
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  validateSearch: signInSearchSchema,
  beforeLoad: ({ search }) => skipSignInWhenAuthenticated(search),
  component: lazyRouteComponent(() => import('@/features/auth/sign-in/SignInPage'), 'SignInPage'),
})

/**
 * The second-factor challenge. Reachable only with a live flow token: the token
 * is minted by `POST /api/user/login` answering `require_2fa` and held in memory
 * by `features/auth/otp/pending-2fa`, so anyone landing here directly — a
 * bookmark, a reload, an expired challenge — is sent back to sign in rather than
 * shown a form whose submit cannot succeed.
 */
const otpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/otp',
  beforeLoad: () => {
    if (readPending2FAChallenge() === null) throw redirect({ href: '/sign-in', replace: true })
  },
  component: lazyRouteComponent(() => import('@/features/auth/otp/OtpPage'), 'OtpPage'),
})

/**
 * The OAuth callbacks. Public by construction — they run before a session
 * exists — and outside `AppShell`, which would otherwise render a signed-out
 * console frame around a transient screen.
 *
 * `/oauth/$provider` is the redirect URI every redirect-kind provider is
 * registered with, and serves both the login and the popup bind flow.
 * `/oauth` is WeChat's, which names its provider in the query string.
 *
 * Neither declares `validateSearch`: the parameters are the provider's, not
 * ours, and the pages read the raw query so nothing gets dropped.
 */
const wechatCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/oauth',
  component: lazyRouteComponent(
    () => import('@/features/auth/callback/WeChatCallbackPage'),
    'WeChatCallbackPage',
  ),
})

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/oauth/$provider',
  component: lazyRouteComponent(
    () => import('@/features/auth/callback/OAuthCallbackPage'),
    'OAuthCallbackPage',
  ),
})

const consoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'console',
  beforeLoad: ({ location }) => requireConsoleAuthentication(location.href),
  component: AppShell,
})

const dashboardRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/dashboard',
  component: lazyRouteComponent(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage'),
})

const settingsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('@/features/settings/SettingsPage'), 'SettingsPage'),
})

const modelsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/models',
  component: lazyRouteComponent(() => import('@/features/models/ModelsPage'), 'ModelsPage'),
})

const usageRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/usage',
  component: lazyRouteComponent(() => import('@/features/usage/UsagePage'), 'UsagePage'),
})

const analyticsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/analytics',
  component: lazyRouteComponent(() => import('@/features/analytics/AnalyticsPage'), 'AnalyticsPage'),
})

const logsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/logs',
  component: lazyRouteComponent(() => import('@/features/logs/LogsPage'), 'LogsPage'),
})

/**
 * The referral page. The URL stays `/organization` on purpose: `router/web-router.go`
 * only serves this custom console for a fixed whitelist of paths, and `/referral` is not
 * on it — moving the URL would make a hard refresh fall back to the legacy dashboard.
 * Renaming it needs that Go whitelist updated first.
 */
const referralRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/organization',
  component: lazyRouteComponent(
    () => import('@/features/referral/ReferralPage'),
    'ReferralPage',
  ),
})

const walletRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/wallet',
  component: lazyRouteComponent(() => import('@/features/wallet/WalletPage'), 'WalletPage'),
})

/**
 * The account centre is three sibling routes rather than one stacked page: each section
 * owns its own heading, so composing them into one document would emit three `<h1>`s.
 * `router/web-router.go` whitelists `/profile`, whose prefix match covers all three.
 */
const profileRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/profile',
  component: lazyRouteComponent(
    () => import('@/features/profile/ProfileRoutes'),
    'ProfileAccountRoute',
  ),
})

const profileSecurityRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/profile/security',
  component: lazyRouteComponent(
    () => import('@/features/profile/ProfileRoutes'),
    'ProfileSecurityRoute',
  ),
})

const profilePreferencesRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/profile/preferences',
  component: lazyRouteComponent(
    () => import('@/features/profile/ProfileRoutes'),
    'ProfilePreferencesRoute',
  ),
})

/**
 * Admin-only. The pages gate themselves on `role >= common.RoleAdminUser` and render a
 * denial rather than a wall of failed requests; the server refuses regardless, so the
 * client-side check is a courtesy, not the boundary.
 */
const subscriptionsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/subscriptions',
  component: lazyRouteComponent(
    () => import('@/features/subscriptions/SubscriptionsPage'),
    'SubscriptionsPage',
  ),
})

const redemptionCodesRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/redemption-codes',
  component: lazyRouteComponent(
    () => import('@/features/redemption/RedemptionCodesPage'),
    'RedemptionCodesPage',
  ),
})

/**
 * Public, like `/pricing`: the rankings nav module can be open to anonymous visitors, and
 * the page reads `/api/status` to find out whether it is.
 */
const rankingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rankings',
  component: lazyRouteComponent(() => import('@/features/rankings/RankingsPage'), 'RankingsPage'),
})

const usersRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/users',
  component: lazyRouteComponent(() => import('@/features/users/UsersPage'), 'UsersPage'),
})

const systemInfoRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/system-info',
  component: lazyRouteComponent(
    () => import('@/features/system-info/SystemInfoPage'),
    'SystemInfoPage',
  ),
})

const drawingTasksRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/usage-logs/drawing',
  component: lazyRouteComponent(
    () => import('@/features/task-logs/DrawingTasksPage'),
    'DrawingTasksPage',
  ),
})

const asyncTasksRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/usage-logs/task',
  component: lazyRouteComponent(
    () => import('@/features/task-logs/AsyncTasksPage'),
    'AsyncTasksPage',
  ),
})

const flowAnalyticsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/dashboard/flow',
  component: lazyRouteComponent(
    () => import('@/features/dashboard-analytics/FlowAnalyticsPage'),
    'FlowAnalyticsPage',
  ),
})

const userAnalyticsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/dashboard/users',
  component: lazyRouteComponent(
    () => import('@/features/dashboard-analytics/UserAnalyticsPage'),
    'UserAnalyticsPage',
  ),
})

const playgroundRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/playground',
  component: lazyRouteComponent(
    () => import('@/features/playground/PlaygroundPage'),
    'PlaygroundPage',
  ),
})

/** `chatId` indexes the operator-configured preset list published on `/api/status`. */
const chatEmbedRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/chat/$chatId',
  component: lazyRouteComponent(() => import('@/features/chat/ChatEmbedPage'), 'ChatEmbedPage'),
})

const chat2LinkRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/chat2link',
  component: lazyRouteComponent(() => import('@/features/chat/Chat2LinkPage'), 'Chat2LinkPage'),
})

/**
 * The legacy console called this page `/keys`; here it is `/settings`. Old bookmarks and
 * the onboarding links that still point at `/keys` land on the real page rather than the
 * previous frontend.
 */
/**
 * The admin model registry and the deployment manager. `router/web-router.go` whitelists
 * `/models`, whose prefix match already hands these two paths to this console — before
 * these routes existed they reached it and 404ed, so the legacy pages were unreachable
 * from either frontend.
 */
const modelRegistryRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/models/metadata',
  component: lazyRouteComponent(
    () => import('@/features/model-registry/ModelRegistryPage'),
    'ModelRegistryPage',
  ),
})

const deploymentsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/models/deployments',
  component: lazyRouteComponent(
    () => import('@/features/deployments/DeploymentsPage'),
    'DeploymentsPage',
  ),
})

/**
 * Paths the legacy console owned that this one reorganised. `router/web-router.go`
 * whitelists their parents, so without these the old URLs reach this app and 404 rather
 * than falling through to the previous frontend.
 */
const usageLogsIndexRedirectRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/usage-logs',
  beforeLoad: () => {
    throw redirect({ replace: true, to: '/logs' })
  },
})

/** The legacy request/billing log; this console calls it `/logs`. */
const usageLogsCommonRedirectRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/usage-logs/common',
  beforeLoad: () => {
    throw redirect({ replace: true, to: '/logs' })
  },
})

/** The legacy dashboard's default section. */
const dashboardOverviewRedirectRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/dashboard/overview',
  beforeLoad: () => {
    throw redirect({ replace: true, to: '/dashboard' })
  },
})

/** The legacy dashboard's model-call analytics; this console keeps it on `/analytics`. */
const dashboardModelsRedirectRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/dashboard/models',
  beforeLoad: () => {
    throw redirect({ replace: true, to: '/analytics' })
  },
})

const keysRedirectRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/keys',
  beforeLoad: () => {
    throw redirect({ replace: true, to: '/settings' })
  },
})

const channelsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/channels',
  component: lazyRouteComponent(() => import('@/features/channels/ChannelsPage'), 'ChannelsPage'),
})

/**
 * One component serves all 41 settings sections: the shell reads `$group` and `$section`
 * and looks the leaf up in its own registry, so a new section needs no router change.
 * `router/web-router.go` whitelists `/system-settings`, whose prefix match covers them all.
 */
const systemSettingsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/system-settings',
  component: lazyRouteComponent(
    () => import('@/features/system-settings/SystemSettingsPage'),
    'SystemSettingsPage',
  ),
})

const systemSettingsGroupRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/system-settings/$group',
  component: lazyRouteComponent(
    () => import('@/features/system-settings/SystemSettingsPage'),
    'SystemSettingsPage',
  ),
})

const systemSettingsSectionRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/system-settings/$group/$section',
  component: lazyRouteComponent(
    () => import('@/features/system-settings/SystemSettingsPage'),
    'SystemSettingsPage',
  ),
})

/**
 * The public pricing surface. Deliberately outside `consoleRoute`: `/api/pricing` and
 * `/api/perf-metrics` are open to anonymous visitors whenever the `pricing` nav module is
 * public, and the page reads `/api/status` itself to find out whether it is.
 *
 * `router/web-router.go` must gain `/pricing` and `/pricing/` before a hard refresh works in
 * production; without that a reload falls through to the legacy frontend.
 */
const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pricing',
  component: lazyRouteComponent(() => import('@/features/pricing/PricingPage'), 'PricingPage'),
})

/** Model names can contain `/`, so the segment is always percent-encoded by the linker. */
const modelPricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pricing/$modelId',
  component: lazyRouteComponent(
    () => import('@/features/pricing/ModelDetailPage'),
    'ModelDetailPage',
  ),
})

/**
 * The addressable error surfaces, ported from the legacy `(errors)` route group. They are
 * public — the legacy group sat outside `_authenticated` — and full-page, because
 * `ErrorState` emits its own `main` landmark and fills the viewport.
 */
const unauthorizedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/401',
  component: lazyRouteComponent(() => import('@/features/errors/ErrorRoutes'), 'UnauthorizedPage'),
})

const forbiddenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/403',
  component: lazyRouteComponent(() => import('@/features/errors/ErrorRoutes'), 'ForbiddenPage'),
})

const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/404',
  component: lazyRouteComponent(() => import('@/features/errors/ErrorRoutes'), 'NotFoundErrorPage'),
})

const serverErrorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/500',
  component: lazyRouteComponent(() => import('@/features/errors/ErrorRoutes'), 'ServerErrorPage'),
})

const maintenanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/503',
  component: lazyRouteComponent(() => import('@/features/errors/ErrorRoutes'), 'MaintenancePage'),
})

/**
 * The slug viewer. Authenticated, like the legacy `/_authenticated/errors/$error`, but
 * rendered outside `AppShell`: the shell already owns the `main#main-content` landmark
 * and `ErrorState` emits a `main` of its own.
 */
const errorSlugRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/errors/$error',
  beforeLoad: ({ location }) => requireConsoleAuthentication(location.href),
  component: lazyRouteComponent(() => import('@/features/errors/ErrorRoutes'), 'ErrorSlugPage'),
})

const routeTree = rootRoute.addChildren([
  otpRoute,
  wechatCallbackRoute,
  oauthCallbackRoute,
  landingRoute,
  aboutRoute,
  privacyPolicyRoute,
  userAgreementRoute,
  signInRoute,
  signUpRoute,
  registerRoute,
  forgotPasswordRoute,
  userResetPasswordRoute,
  resetPasswordRoute,
  setupRoute,
  pricingRoute,
  modelPricingRoute,
  unauthorizedRoute,
  forbiddenRoute,
  notFoundRoute,
  serverErrorRoute,
  maintenanceRoute,
  errorSlugRoute,
  rankingsRoute,
  consoleRoute.addChildren([
    dashboardRoute,
    settingsRoute,
    modelsRoute,
    usageRoute,
    analyticsRoute,
    logsRoute,
    referralRoute,
    walletRoute,
    profileRoute,
    profileSecurityRoute,
    profilePreferencesRoute,
    subscriptionsRoute,
    redemptionCodesRoute,
    usersRoute,
    systemInfoRoute,
    drawingTasksRoute,
    asyncTasksRoute,
    flowAnalyticsRoute,
    userAnalyticsRoute,
    playgroundRoute,
    chatEmbedRoute,
    chat2LinkRoute,
    keysRedirectRoute,
    modelRegistryRoute,
    deploymentsRoute,
    usageLogsIndexRedirectRoute,
    usageLogsCommonRedirectRoute,
    dashboardOverviewRedirectRoute,
    dashboardModelsRedirectRoute,
    channelsRoute,
    systemSettingsRoute,
    systemSettingsGroupRoute,
    systemSettingsSectionRoute,
  ]),
])

export const router = createRouter({
  context: { queryClient },
  routeTree,
  defaultPreload: 'intent',
  defaultPendingComponent: RouteLoading,
  defaultPendingMs: 150,
  defaultPendingMinMs: 250,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
