import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import LogOutIcon from 'lucide-react/dist/esm/icons/log-out'
import MonitorSmartphoneIcon from 'lucide-react/dist/esm/icons/monitor-smartphone'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { EmptyState } from '@/components/system/EmptyState'
import { Alert, Button, IconBadge, Panel, Skeleton, StatusBadge } from '@/components/ui'
import {
  loginSessionsQuery,
  revokeLoginSession,
  revokeOtherLoginSessions,
  type LoginSession,
} from '@/features/profile/security/api'
import {
  describeDevice,
  describeLoginMethod,
  orderSessions,
} from '@/features/profile/security/session-display'
import { clearAuthenticatedClientState } from '@/lib/auth-session'
import { formatDateTime } from '@/lib/format'
import { getLegacySignInHref } from '@/lib/navigation'

/**
 * Every browser and API client currently holding a session on this account.
 *
 * Signing out the CURRENT session is a real option — a user on a borrowed
 * machine wants it — but it is never the same button as signing out someone
 * else. The current row is badged, its action is worded for this device, and its
 * confirmation says plainly what will happen. The server also tells us: the
 * delete response carries `current`, and when that is true this page hands the
 * browser to sign-in instead of quietly rendering a dead console.
 */
export function SessionsPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const sessionsQuery = useQuery(loginSessionsQuery())
  const [revokeTarget, setRevokeTarget] = useState<LoginSession | null>(null)
  const [confirmOthers, setConfirmOthers] = useState(false)

  const leaveConsole = () => {
    clearAuthenticatedClientState(queryClient)
    window.location.assign(getLegacySignInHref())
  }

  const revokeOne = useMutation({
    mutationFn: (sid: string) => revokeLoginSession(sid),
    onSuccess: (result) => {
      setRevokeTarget(null)
      if (result.current) {
        leaveConsole()
        return
      }
      toast.success(t('That session was signed out'))
      void queryClient.invalidateQueries({ queryKey: ['profile', 'security', 'sessions'] })
    },
    onError: (failure: unknown) => {
      setRevokeTarget(null)
      toast.error(toErrorMessage(failure))
    },
  })

  const revokeOthers = useMutation({
    mutationFn: revokeOtherLoginSessions,
    onSuccess: (result) => {
      setConfirmOthers(false)
      toast.success(t('{{count}} other sessions signed out', { count: result.revoked_count }))
      void queryClient.invalidateQueries({ queryKey: ['profile', 'security', 'sessions'] })
    },
    onError: (failure: unknown) => {
      setConfirmOthers(false)
      toast.error(toErrorMessage(failure))
    },
  })

  const sessions = sessionsQuery.data ? orderSessions(sessionsQuery.data) : []
  const otherCount = sessions.filter((session) => !session.current).length
  const busySid = revokeOne.isPending ? revokeOne.variables : undefined

  return (
    <Panel>
      <Panel.Header
        actions={(
          <Button
            aria-busy={revokeOthers.isPending}
            disabled={otherCount === 0 || revokeOthers.isPending}
            onClick={() => setConfirmOthers(true)}
            size="sm"
            variant="outline"
          >
            <LogOutIcon aria-hidden="true" />
            {t('Sign out other sessions')}
          </Button>
        )}
        description={t('Everywhere your account is currently signed in.')}
        icon={<IconBadge icon={<MonitorSmartphoneIcon aria-hidden="true" />} size="sm" tone="muted" />}
        title={t('Active sessions')}
      />

      {sessionsQuery.isPending ? (
        <Panel.Body>
          <div aria-busy="true" className="flex flex-col gap-3" role="status">
            <span className="sr-only">{t('Loading active sessions')}</span>
            <Skeleton height={64} variant="block" />
            <Skeleton height={64} variant="block" />
          </div>
        </Panel.Body>
      ) : null}

      {sessionsQuery.isError ? (
        <Panel.Body>
          <Alert
            action={(
              <Button
                aria-busy={sessionsQuery.isFetching}
                disabled={sessionsQuery.isFetching}
                onClick={() => void sessionsQuery.refetch()}
                size="sm"
                variant="outline"
              >
                {t('Try again')}
              </Button>
            )}
            title={t('Sessions could not be loaded')}
            tone="destructive"
          >
            {toErrorMessage(sessionsQuery.error)}
          </Alert>
        </Panel.Body>
      ) : null}

      {sessionsQuery.data && sessions.length === 0 ? (
        <EmptyState
          description={t('This account is not signed in anywhere the server can see.')}
          headingLevel={3}
          title={t('No active sessions')}
        />
      ) : null}

      {sessions.length > 0 ? (
        <>
          <ul>
            {sessions.map((session) => (
              <li
                className="flex flex-col gap-3 border-b border-border px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                key={session.sid}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {describeDevice(
                        session.user_agent,
                        t('Unknown device'),
                        t('Other browser'),
                      )}
                    </p>
                    {session.current ? (
                      <StatusBadge tone="success">{t('This device')}</StatusBadge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {describeLoginMethod(session.login_method, t)}
                    {' · '}
                    <span className="mono">{session.ip}</span>
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">
                    {t('Last active {{when}} · signed in {{start}}', {
                      start: formatDateTime(session.created_at),
                      when: formatDateTime(session.last_active_at),
                    })}
                  </p>
                </div>

                <Button
                  aria-busy={busySid === session.sid}
                  className="sm:shrink-0"
                  disabled={revokeOne.isPending}
                  onClick={() => setRevokeTarget(session)}
                  size="sm"
                  variant={session.current ? 'outline' : 'quiet'}
                >
                  {session.current ? t('Sign out this device') : t('Sign out')}
                </Button>
              </li>
            ))}
          </ul>

          <Panel.Footer align="start">
            <p className="text-xs leading-5 text-muted">
              {t(
                'Device names are worked out in your browser from each session’s user-agent text (browser = first match of Edge/Chrome/Firefox/Safari, platform = first match of iOS/Android/Windows/macOS/Linux). The server stores the raw text only.',
              )}
            </p>
          </Panel.Footer>
        </>
      ) : null}

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={revokeTarget?.current ? t('Sign out this device') : t('Sign out')}
        description={
          revokeTarget?.current
            ? t('You will be signed out here immediately and sent back to the sign-in page.')
            : t('That device will have to sign in again to use your account.')
        }
        destructive
        isLoading={revokeOne.isPending}
        onConfirm={() => {
          if (revokeTarget) revokeOne.mutate(revokeTarget.sid)
        }}
        onOpenChange={(next) => { if (!next) setRevokeTarget(null) }}
        open={revokeTarget !== null}
        title={revokeTarget?.current ? t('Sign out of this device?') : t('Sign out that session?')}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Sign out other sessions')}
        description={t(
          'Every other browser and client signed in to this account will be signed out. This device stays signed in.',
        )}
        destructive
        isLoading={revokeOthers.isPending}
        onConfirm={() => revokeOthers.mutate()}
        onOpenChange={setConfirmOthers}
        open={confirmOthers}
        title={t('Sign out {{count}} other sessions?', { count: otherCount })}
      />
    </Panel>
  )
}
