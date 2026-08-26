import CompassIcon from 'lucide-react/dist/esm/icons/compass'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <main className="settings-canvas grid min-h-screen place-items-center px-6 py-12 text-center">
      <div className="max-w-lg">
        <CompassIcon aria-hidden="true" className="mx-auto size-8 text-primary" />
        <h1 className="mt-5 text-2xl font-bold">{t('Page not found')}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{t('The page you requested does not exist.')}</p>
        <Link className="mt-6 inline-flex min-h-10 items-center justify-center rounded-[4px] border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10" to="/dashboard">
          {t('Return to dashboard')}
        </Link>
      </div>
    </main>
  )
}
