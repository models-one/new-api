import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Panel, Skeleton } from '@/components/ui'
import { AccessTokenPanel } from '@/features/profile/components/AccessTokenPanel'
import { AccountPanel } from '@/features/profile/components/AccountPanel'
import { CheckInPanel } from '@/features/profile/components/CheckInPanel'
import { LoginIdentityPanel } from '@/features/profile/components/LoginIdentityPanel'
import { ProfileHeader } from '@/features/profile/components/ProfileHeader'
import { useServerConfig } from '@/hooks/use-server-status'
import { selfUserQuery } from '@/lib/api/user'

/**
 * The identity half of the account centre: who you are, how you sign in, the management
 * token, and the daily check-in.
 *
 * `ProfileHeader` emits the page's `<h1>` and reports its own load failure, so this section
 * is safe to render first on the profile route. The security and preference panels are a
 * separate section and compose underneath.
 */
export function ProfileIdentity() {
  const { t } = useTranslation()
  const selfQuery = useQuery(selfUserQuery())
  // `/api/status` publishes this flag; `GET /api/user/checkin` refuses with a bare
  // `success:false` when it is off, so the panel is not rendered rather than made to fail.
  const checkinEnabled = useServerConfig((status) => status.checkin_enabled === true, false)

  const user = selfQuery.data

  return (
    <div className="flex flex-col gap-8">
      <ProfileHeader />

      {user === undefined ? (
        <div aria-busy={selfQuery.isPending} className="flex flex-col gap-8">
          {selfQuery.isPending ? (
            <>
              <span className="sr-only" role="status">{t('Loading your account')}</span>
              {['profile', 'sign-in'].map((key) => (
                <Panel as="div" className="p-6" key={key}>
                  <Skeleton height={20} variant="block" width={160} />
                  <Skeleton className="mt-6" height={120} variant="block" />
                </Panel>
              ))}
            </>
          ) : null}
        </div>
      ) : (
        <>
          <AccountPanel user={user} />
          <LoginIdentityPanel user={user} />
        </>
      )}

      <AccessTokenPanel />

      {checkinEnabled ? <CheckInPanel /> : null}
    </div>
  )
}
