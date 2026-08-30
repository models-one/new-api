import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/ui'

export type CallbackGuideRow = {
  label: string
  value: string
  /** Accessible name for that row's copy control, e.g. "Copy the callback URL". */
  copyLabel: string
}

type CallbackGuideProps = {
  /** Said once above the rows, e.g. "Register these in the provider's application." */
  description: string
  rows: readonly CallbackGuideRow[]
  /** Shown instead of the rows when `ServerAddress` is unset. */
  siteUrlMissing: boolean
}

/**
 * The two or three URLs an operator has to paste into the provider's own console.
 *
 * Both are derived from the `ServerAddress` option, which the backend also concatenates
 * callback paths onto at sign-in time — so when it is unset the values here would be
 * wrong, and the block says so instead of printing a broken URL with a placeholder host.
 */
export function CallbackGuide(props: CallbackGuideProps) {
  const { t } = useTranslation()

  if (props.siteUrlMissing) {
    return (
      <div className="panel-muted px-4 py-3 text-xs leading-5 text-muted">
        {t('Set the server address under Site → System information first. The sign-in callback URLs are built from it, and the provider will reject a redirect that does not match.')}
      </div>
    )
  }

  return (
    <div className="panel-muted flex flex-col gap-2 px-4 py-3">
      <p className="text-xs leading-5 text-muted">{props.description}</p>
      <dl className="flex flex-col gap-1.5">
        {props.rows.map((row) => (
          <div className="flex flex-wrap items-center justify-between gap-2" key={row.label}>
            <dt className="text-xs text-muted">{row.label}</dt>
            <dd className="flex min-w-0 items-center gap-1">
              <code className="mono truncate rounded-[3px] bg-sidebar px-1.5 py-0.5 text-xs text-foreground">
                {row.value}
              </code>
              <CopyButton label={row.copyLabel} size="icon-sm" value={row.value} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
