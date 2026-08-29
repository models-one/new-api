import { Link } from '@tanstack/react-router'
import ArrowLeftIcon from 'lucide-react/dist/esm/icons/arrow-left'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SkipToMain } from '@/components/system/SkipToMain'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuthServerConfig } from '@/features/auth/server-config'

type AuthLayoutProps = {
  /** Page heading. Also names the `main` landmark through `aria-labelledby`. */
  title: string
  description?: string
  /** Slot under the card, for the legal/terms footnote. */
  footer?: ReactNode
  children: ReactNode
}

/**
 * The centred shell every authentication route sits in.
 *
 * The brand comes from `/api/status`, so it is a skeleton until the request
 * settles — showing a placeholder name first and swapping it for the operator's
 * would read as the user having landed on the wrong site.
 */
export function AuthLayout(props: AuthLayoutProps) {
  const { t } = useTranslation()
  const { config, isPending } = useAuthServerConfig()
  const titleId = useId()
  const mainId = useId()

  return (
    <div className="settings-canvas flex min-h-screen flex-col">
      <SkipToMain targetId={mainId} />

      <header className="flex items-center px-4 py-5 sm:px-8">
        <Link
          className="inline-flex items-center gap-2.5 rounded-[4px] text-muted transition-colors hover:text-foreground"
          to="/"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4 shrink-0" />
          {isPending ? (
            <span aria-hidden="true" className="flex items-center gap-2.5">
              <Skeleton height={28} variant="circle" width={28} />
              <Skeleton height={14} width={104} />
            </span>
          ) : (
            <span className="flex items-center gap-2.5">
              {config.logo === '' ? null : (
                <img alt="" className="size-7 rounded-full object-cover" src={config.logo} />
              )}
              <span className="text-base font-bold text-foreground">
                {config.systemName === '' ? t('Back to home') : config.systemName}
              </span>
            </span>
          )}
        </Link>
      </header>

      <main
        aria-labelledby={titleId}
        className="flex flex-1 items-center justify-center px-4 pt-2 pb-14"
        id={mainId}
      >
        <div className="w-full max-w-[26rem]">
          <section className="panel px-6 py-7 sm:px-8 sm:py-8">
            <h1 className="text-2xl font-bold text-foreground" id={titleId}>{props.title}</h1>
            {props.description === undefined ? null : (
              <p className="mt-2 text-sm leading-6 text-muted">{props.description}</p>
            )}
            <div className="mt-6 flex flex-col gap-5">{props.children}</div>
          </section>

          {props.footer === undefined ? null : <div className="mt-5">{props.footer}</div>}
        </div>
      </main>
    </div>
  )
}
