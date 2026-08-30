import HardHatIcon from 'lucide-react/dist/esm/icons/hard-hat'
import { useTranslation } from 'react-i18next'

import { Alert, Panel } from '@/components/ui'

type SectionPlaceholderProps = {
  /** The section's own title, so the heading matches the nav entry that led here. */
  title: string
  /** The path this section occupies in the legacy console, for the operator's bearings. */
  legacyPath: string
}

/**
 * The stand-in for a section that has not been rebuilt in this skin yet.
 *
 * It deliberately claims NOTHING about the settings behind it — no key names, no
 * controls, no values. Showing a half-ported section would be worse than showing none:
 * an operator would reasonably read an absent control as an absent capability.
 */
export function SectionPlaceholder(props: SectionPlaceholderProps) {
  const { t } = useTranslation()

  return (
    <Panel as="section">
      <Panel.Header description={t('This section has not been rebuilt in this console yet.')} title={props.title} />
      <Panel.Body>
        <Alert icon={<HardHatIcon aria-hidden="true" />} title={t('Not available here yet')} tone="warning">
          <p>
            {t('Nothing on this page has been removed from the deployment — these settings simply have no controls in this console yet, and are still reachable in the previous admin interface at {{path}}.', { path: props.legacyPath })}
          </p>
        </Alert>
      </Panel.Body>
    </Panel>
  )
}
