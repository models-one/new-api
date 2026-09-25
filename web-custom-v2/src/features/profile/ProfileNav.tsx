import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

type ProfileSection = { to: '/profile' | '/profile/security' | '/profile/preferences'; labelKey: string }

/**
 * The account centre is three sibling routes rather than one stacked page: each section
 * owns its heading, so stacking them would put three `<h1>`s on one document.
 */
const sections: ProfileSection[] = [
  { to: '/profile', labelKey: 'Account' },
  { to: '/profile/security', labelKey: 'Security' },
  { to: '/profile/preferences', labelKey: 'Preferences' },
]

export function ProfileNav() {
  const { t } = useTranslation()

  return (
    <nav aria-label={t('Account sections')} className="flex flex-wrap gap-1">
      {sections.map((section) => (
        <Link
          activeOptions={{ exact: section.to === '/profile' }}
          activeProps={{
            'aria-current': 'page',
            className: 'border-primary bg-primary/10 text-primary',
          }}
          className={cn(
            'inline-flex min-h-9 items-center rounded-[4px] border border-transparent px-3 text-sm font-semibold text-muted',
            'hover:bg-surface-high hover:text-foreground',
          )}
          key={section.to}
          to={section.to}
        >
          {t(section.labelKey)}
        </Link>
      ))}
    </nav>
  )
}
