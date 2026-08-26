import LoaderCircleIcon from 'lucide-react/dist/esm/icons/loader-circle'
import { useTranslation } from 'react-i18next'

export function RouteLoading() {
  const { t } = useTranslation()

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-center" role="status">
      <div>
        <LoaderCircleIcon aria-hidden="true" className="mx-auto size-7 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted">{t('Loading console')}</p>
      </div>
    </div>
  )
}
