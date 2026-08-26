import AlertTriangleIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { AuthenticationUnavailableError } from '@/lib/auth-session'

type RouteErrorPageProps = {
  error: Error
  reset: () => void
}

export function RouteErrorPage(props: RouteErrorPageProps) {
  const { t } = useTranslation()
  const description = props.error instanceof AuthenticationUnavailableError
    ? t('Authentication service is temporarily unavailable.')
    : t('The console could not complete this request.')

  return (
    <main className="settings-canvas grid min-h-screen place-items-center px-6 py-12 text-center">
      <div className="max-w-lg">
        <AlertTriangleIcon aria-hidden="true" className="mx-auto size-8 text-warning" />
        <h1 className="mt-5 text-2xl font-bold">{t('Unable to load this page.')}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
        <Button className="mt-6" onClick={props.reset}>{t('Try again')}</Button>
      </div>
    </main>
  )
}
