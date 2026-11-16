import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import ArrowDownIcon from 'lucide-react/dist/esm/icons/arrow-down'
import ArrowUpIcon from 'lucide-react/dist/esm/icons/arrow-up'
import XIcon from 'lucide-react/dist/esm/icons/x'

import { NativeSelect } from '@/components/form'
import { Badge, Button } from '@/components/ui'
import { requestPluginInstancesQuery } from '@/features/request-processing/api'

type ChannelRequestPluginsFieldProps = {
  /** Instance ids, in the order they run for this channel (`setting.request_plugins`). */
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}

/** The request processing instances a channel adds, as an ordered list. */
export function ChannelRequestPluginsField(props: ChannelRequestPluginsFieldProps) {
  const { t } = useTranslation()
  const instancesQuery = useQuery(requestPluginInstancesQuery())
  const instances = instancesQuery.data ?? []
  const candidates = instances.filter((instance) => !props.value.includes(instance.id))
  // An administrator who may not bind plugins cannot read the list; a channel that
  // already names instances still shows them, so a save never drops them unseen.
  if (!instancesQuery.isSuccess && props.value.length === 0) return null

  let placeholder = t('Add an instance')
  if (instancesQuery.isPending) placeholder = t('Loading…')
  else if (instancesQuery.isError) placeholder = t('Instances could not be loaded')
  else if (candidates.length === 0) placeholder = t('No more instances')

  function move(index: number, offset: -1 | 1) {
    const next = [...props.value]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    props.onChange(next)
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium text-foreground">{t('Request processing plugins')}</legend>
      <p className="text-xs leading-5 text-muted">{t("Instances for all requests or for this channel's groups also apply.")}</p>
      <NativeSelect
        disabled={props.disabled || !instancesQuery.isSuccess || candidates.length === 0}
        hideLabel
        label={t('Add an instance')}
        onChange={(event) => {
          const id = event.target.value
          if (id !== '' && !props.value.includes(id)) props.onChange([...props.value, id])
        }}
        options={[{ label: placeholder, value: '' }, ...candidates.map((instance) => ({ label: instance.name, value: instance.id }))]}
        value=""
      />
      {props.value.length === 0 ? null : (
        <ol className="flex flex-col gap-2">
          {props.value.map((id, index) => {
            const instance = instances.find((item) => item.id === id)
            const name = instance?.name ?? id
            return (
              <li className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5" key={id}>
                <span className="w-5 text-xs text-muted tabular-nums">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{name}</span>
                {instancesQuery.isSuccess && !instance ? <Badge tone="warning">{t('Deleted')}</Badge> : null}
                {instance && !instance.enabled ? <Badge tone="muted">{t('Disabled')}</Badge> : null}
                <Button
                  aria-label={t('Move {{name}} up', { name })}
                  disabled={props.disabled || index === 0}
                  onClick={() => move(index, -1)}
                  size="icon-sm"
                  variant="quiet"
                >
                  <ArrowUpIcon aria-hidden="true" />
                </Button>
                <Button
                  aria-label={t('Move {{name}} down', { name })}
                  disabled={props.disabled || index === props.value.length - 1}
                  onClick={() => move(index, 1)}
                  size="icon-sm"
                  variant="quiet"
                >
                  <ArrowDownIcon aria-hidden="true" />
                </Button>
                <Button
                  aria-label={t('Remove {{name}}', { name })}
                  disabled={props.disabled}
                  onClick={() => props.onChange(props.value.filter((item) => item !== id))}
                  size="icon-sm"
                  variant="quiet"
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </li>
            )
          })}
        </ol>
      )}
    </fieldset>
  )
}
