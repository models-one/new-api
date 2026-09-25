import type { ReactNode } from 'react'

import { PreferencesPage } from '@/features/profile/preferences/PreferencesPage'
import { ProfileIdentity } from '@/features/profile/ProfileIdentity'
import { ProfileNav } from '@/features/profile/ProfileNav'
import { SecurityPage } from '@/features/profile/security/SecurityPage'

/**
 * The account centre is three sibling routes: each section owns its own `<h1>`, so
 * stacking them into one document would emit three of them.
 *
 * The section switcher is composed HERE rather than inside the sections, so those stay
 * router-free and can be rendered on their own in tests.
 */
function ProfileLayout(props: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <ProfileNav />
      {props.children}
    </div>
  )
}

export function ProfileAccountRoute() {
  return (
    <ProfileLayout>
      <ProfileIdentity />
    </ProfileLayout>
  )
}

export function ProfileSecurityRoute() {
  return (
    <ProfileLayout>
      <SecurityPage />
    </ProfileLayout>
  )
}

export function ProfilePreferencesRoute() {
  return (
    <ProfileLayout>
      <PreferencesPage />
    </ProfileLayout>
  )
}
