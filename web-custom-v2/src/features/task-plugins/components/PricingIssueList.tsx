import { useTranslation } from 'react-i18next'

import type { PricingIssue } from '../types'

/** A plugin reports one issue per model; a long catalog stays readable. */
const VISIBLE_ISSUES = 5

export const PRICING_ISSUE_REASONS: Record<PricingIssue['reason'], string> = {
  unconfigured: 'No price set',
  incompatible: 'The price uses usage the plugin no longer provides',
  stale: 'The plugin no longer offers this model',
}

/** The models a plugin change left without a usable price. */
export function PricingIssueList(props: { issues: readonly PricingIssue[] }) {
  const { t } = useTranslation()
  const hidden = props.issues.length - VISIBLE_ISSUES
  return (
    <div className="flex flex-col gap-0.5">
      <p>{t('Prices of these models need attention:')}</p>
      <ul>
        {props.issues.slice(0, VISIBLE_ISSUES).map((issue) => (
          <li key={`${issue.model_name}:${issue.plugin_key}`}>
            {t('{{name}}: {{reason}}', { name: issue.model_name, reason: t(PRICING_ISSUE_REASONS[issue.reason]) })}
          </li>
        ))}
      </ul>
      {hidden > 0 ? <p>{t('And {{count}} more models', { count: hidden })}</p> : null}
    </div>
  )
}
