import { useTranslation } from 'react-i18next'
import ExternalLinkIcon from 'lucide-react/dist/esm/icons/external-link'

import { getPluginWebsite } from '../lib/plugin-website'

/**
 * A plugin's own website. The address comes from plugin metadata, so only an explicit
 * https link is rendered, and it opens without a reference back to this console.
 */
export function PluginWebsiteLink(props: { website?: string }) {
  const { t } = useTranslation()
  const website = getPluginWebsite(props.website)
  if (!website) return null
  return (
    <a
      className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
      href={website}
      rel="noopener noreferrer"
      target="_blank"
    >
      <ExternalLinkIcon aria-hidden="true" className="size-3" />
      {t('Plugin website')}
    </a>
  )
}
