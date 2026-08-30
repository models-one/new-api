import BracesIcon from 'lucide-react/dist/esm/icons/braces'
import RotateCcwIcon from 'lucide-react/dist/esm/icons/rotate-ccw'
import SlidersHorizontalIcon from 'lucide-react/dist/esm/icons/sliders-horizontal'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs } from '@/components/disclosure'
import { Textarea } from '@/components/form'
import { ConfirmDialog } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'
import { formatJson } from '@/features/system-settings/site-content/option-json'

type NavBlobEditorProps = {
  /** The option key, shown on the raw editor's label so it is never ambiguous. */
  optionKey: string
  value: string
  onChange: (next: string) => void
  disabled: boolean
  /** Present when the stored text cannot be read; the switches are hidden while it is. */
  issue?: string
  /** The serialised defaults, applied by "Restore defaults". */
  defaults: string
  resetTitle: string
  resetDescription: string
  jsonDescription: string
  /** The switch editor. Rendered only when the value parses. */
  children: ReactNode
}

/**
 * The shell both navigation editors share: a visual tab of switches, a raw JSON tab, and
 * a restore-defaults action.
 *
 * The raw tab is not optional here. These two values decide what every user of the
 * deployment can reach and the server validates neither of them, so a blob this editor
 * cannot read is a blob that has to be repairable IN PLACE — otherwise the only way out
 * of a bad save would be the database. When the text cannot be parsed the switches are
 * replaced by an explanation rather than being drawn against invented values: showing
 * "everything enabled" over an unreadable blob would be a claim about the deployment that
 * nobody has checked.
 *
 * Restoring defaults only fills the editor in. Nothing is written until the section is
 * saved, and "Discard changes" still takes it back — but it does overwrite whatever the
 * operator was looking at, so it asks first.
 */
export function NavBlobEditor(props: NavBlobEditorProps) {
  const { t } = useTranslation()
  const [confirmingReset, setConfirmingReset] = useState(false)

  return (
    <Tabs defaultValue="modules">
      <Tabs.List label={t('Navigation editor views')}>
        <Tabs.Tab value="modules">
          <SlidersHorizontalIcon aria-hidden="true" />
          {t('Modules')}
        </Tabs.Tab>
        <Tabs.Tab value="json">
          <BracesIcon aria-hidden="true" />
          {t('JSON')}
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="modules">
        <div className="flex flex-col gap-4">
          {props.issue === undefined ? (
            props.children
          ) : (
            <Alert
              icon={<TriangleAlertIcon aria-hidden="true" />}
              title={t('This navigation setting cannot be read')}
              tone="destructive"
            >
              <p>{props.issue}</p>
              <p className="mt-2">
                {t('The server stores this value without checking it, and falls back to showing every module when it cannot parse it. Repair the text on the JSON tab, or restore the defaults.')}
              </p>
            </Alert>
          )}

          <div>
            <Button
              disabled={props.disabled}
              onClick={() => setConfirmingReset(true)}
              size="sm"
              variant="outline"
            >
              <RotateCcwIcon aria-hidden="true" />
              {t('Restore defaults')}
            </Button>
          </div>
        </div>
      </Tabs.Panel>

      <Tabs.Panel value="json">
        <div className="flex flex-col gap-3">
          <Textarea
            description={props.jsonDescription}
            disabled={props.disabled}
            error={props.issue}
            invalid={props.issue !== undefined}
            label={t('Stored value ({{key}})', { key: props.optionKey })}
            onChange={(event) => props.onChange(event.target.value)}
            rows={14}
            spellCheck={false}
            textareaClassName="mono text-xs"
            value={props.value}
          />
          <div>
            <Button
              disabled={props.disabled}
              onClick={() => props.onChange(formatJson(props.value, props.defaults))}
              size="sm"
              variant="outline"
            >
              {t('Reformat')}
            </Button>
          </div>
        </div>
      </Tabs.Panel>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Restore defaults')}
        description={props.resetDescription}
        onConfirm={() => {
          props.onChange(props.defaults)
          setConfirmingReset(false)
        }}
        onOpenChange={setConfirmingReset}
        open={confirmingReset}
        title={props.resetTitle}
      />
    </Tabs>
  )
}
