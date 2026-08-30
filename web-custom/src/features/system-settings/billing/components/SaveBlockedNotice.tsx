import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useTranslation } from 'react-i18next'

import { Alert, Button } from '@/components/ui'

/**
 * WHY A SECTION-LEVEL SUMMARY OF VALIDATION ERRORS EXISTS AT ALL.
 *
 * `useOptionSectionForm.save()` refuses to run when any dirty key fails its check: it
 * flips every message visible and returns without contacting the server. In a section
 * whose controls are all on screen that is enough — the operator sees the field go red.
 *
 * Two of the billing sections are not like that. `PaymentSection` puts its forty-odd
 * controls behind seven tabs, and `Tabs.Panel` UNMOUNTS the panel that is not showing;
 * `ModelPricingSection` keeps its ten raw JSON blobs inside a collapsed `<details>`. In
 * both, a bad value can be the reason Save does nothing while the message that explains
 * it is not rendered anywhere on the page. The operator presses Save and the console
 * appears to ignore them.
 *
 * So each of those two sections renders this above its controls: what is blocking, where
 * the control lives, and — when the section can navigate to it — a button that opens the
 * tab or panel holding it.
 */

type SaveBlockedNoticeProps = {
  /** `form.errors`. Only the messages the form has decided are visible. */
  errors: Readonly<Record<string, string | undefined>>
  /** `form.dirtyKeys`. An error on an untouched key does not block a save. */
  dirtyKeys: readonly string[]
  /** Where the control lives, e.g. "Stripe · Stripe unit price". */
  locate: (key: string) => string
  /** Opens the tab or panel holding the control. Omit when there is nothing to open. */
  onReveal?: (key: string) => void
  /** Accessible name for the reveal button, given the located description. */
  revealLabel?: (location: string) => string
}

export function SaveBlockedNotice(props: SaveBlockedNoticeProps) {
  const { t } = useTranslation()

  const blocking = props.dirtyKeys.filter((key) => props.errors[key] !== undefined)
  if (blocking.length === 0) return null

  return (
    <Alert
      icon={<TriangleAlertIcon aria-hidden="true" />}
      title={t('Save is blocked by {{count}} change(s)', { count: blocking.length })}
      tone="destructive"
    >
      <p>
        {t('Nothing is written while a changed setting fails its check, and the control may be behind a tab or a collapsed panel rather than on screen.')}
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {blocking.map((key) => {
          const location = props.locate(key)
          return (
            <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1" key={key}>
              <span className="font-semibold text-foreground">{location}</span>
              <span aria-hidden="true">—</span>
              <span>{props.errors[key]}</span>
              {props.onReveal ? (
                <Button
                  aria-label={
                    props.revealLabel?.(location) ?? t('Show {{location}}', { location })
                  }
                  onClick={() => props.onReveal?.(key)}
                  size="sm"
                  title={props.revealLabel?.(location) ?? t('Show {{location}}', { location })}
                  variant="outline"
                >
                  {t('Show it')}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </Alert>
  )
}
