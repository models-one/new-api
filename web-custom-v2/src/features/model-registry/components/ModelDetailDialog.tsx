import { useQuery } from '@tanstack/react-query'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog, toErrorMessage } from '@/components/overlay'
import {
  Alert,
  Badge,
  Button,
  DescriptionList,
  Skeleton,
  StatusBadge,
  type DescriptionListItem,
} from '@/components/ui'
import { fetchRegistryModel, vendorsQuery } from '@/features/model-registry/api'
import {
  modelStatusLabel,
  modelStatusTone,
  nameRuleLabel,
  nameRuleTone,
  NAME_RULE,
  parseEndpoints,
  parseTags,
  quotaTypeLabel,
  vendorName,
} from '@/features/model-registry/model-registry-presentation'
import { formatDateTime, formatNumber } from '@/lib/format'

type ModelDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  modelId: number | undefined
}

/**
 * Everything on `GET /api/models/:id` that the table has no column for: the channels
 * that actually serve the definition, the token groups that may reach it, how it is
 * billed, and — for a rule row — the published names the rule matched.
 *
 * Every one of those five is computed by the server on each read (`enrichModels`), not
 * stored, so none of them can be edited here.
 */
export function ModelDetailDialog(props: ModelDetailDialogProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language

  const detailQuery = useQuery({
    queryKey: ['model-registry', 'detail', props.modelId] as const,
    queryFn: () => fetchRegistryModel(props.modelId as number),
    enabled: props.open && props.modelId !== undefined,
    gcTime: 0,
    staleTime: 0,
  })

  const vendors = useQuery({ ...vendorsQuery(), enabled: props.open })
  const model = detailQuery.data

  const body = ((): ReactNode => {
    if (detailQuery.isLoading) {
      return (
        <div aria-busy="true" className="flex flex-col gap-3" role="status">
          <span className="sr-only">{t('Loading this model definition')}</span>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )
    }

    if (detailQuery.isError) {
      return (
        <Alert
          action={
            <Button
              aria-busy={detailQuery.isFetching}
              disabled={detailQuery.isFetching}
              onClick={() => void detailQuery.refetch()}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('Could not load this model definition')}
          tone="destructive"
        >
          {toErrorMessage(detailQuery.error)}
        </Alert>
      )
    }

    if (model === undefined) return null

    const tags = parseTags(model.tags)
    const endpoints = parseEndpoints(model.endpoints)
    const channels = model.bound_channels ?? []
    const groups = model.enable_groups ?? []
    const quotaTypes = model.quota_types ?? []
    const matched = model.matched_models ?? []
    const statusLabel = modelStatusLabel(model.status)

    const items: DescriptionListItem[] = [
      {
        description: <span className="mono">{`#${model.id}`}</span>,
        id: 'id',
        term: t('Definition id'),
      },
      {
        description: (
          <StatusBadge size="sm" tone={modelStatusTone(model.status)}>
            {statusLabel === ''
              ? t('Status {{code}}', { code: model.status })
              : t(statusLabel)}
          </StatusBadge>
        ),
        id: 'status',
        term: t('Status'),
      },
      {
        description: (
          <Badge size="sm" tone={nameRuleTone(model.name_rule)}>
            {nameRuleLabel(model.name_rule) === ''
              ? t('Rule {{code}}', { code: model.name_rule })
              : t(nameRuleLabel(model.name_rule))}
          </Badge>
        ),
        id: 'rule',
        term: t('Match rule'),
      },
      {
        description: vendorName(vendors.data ?? [], model.vendor_id) ?? (
          <span className="text-muted">{t('None')}</span>
        ),
        id: 'vendor',
        term: t('Vendor'),
      },
      {
        description: model.icon === undefined || model.icon === ''
          ? <span className="text-muted">{t('None')}</span>
          : <span className="mono">{model.icon}</span>,
        id: 'icon',
        term: t('Icon name'),
      },
      {
        description: model.sync_official === 0 ? t('No') : t('Yes'),
        id: 'sync',
        term: t('Follows the official upstream'),
      },
      {
        description: <span className="mono">{formatDateTime(model.created_time, locale)}</span>,
        id: 'created',
        term: t('Created'),
      },
      {
        description: <span className="mono">{formatDateTime(model.updated_time, locale)}</span>,
        id: 'updated',
        term: t('Last updated'),
      },
    ]

    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="mono text-base font-semibold text-foreground">{model.model_name}</p>
          {model.description === undefined || model.description === '' ? (
            <p className="mt-1 text-sm text-muted">{t('No description.')}</p>
          ) : (
            <p className="mt-1 text-sm leading-6 text-foreground">{model.description}</p>
          )}
        </div>

        <DescriptionList items={items} label={t('Definition fields')} layout="row" />

        <ChipSection
          emptyText={t('No tags.')}
          items={tags}
          title={t('Tags')}
        />

        <ChipSection
          emptyText={t('None reported.')}
          items={endpoints}
          note={t('Reported by the server. When the stored column is empty it fills this in from the endpoints the serving channels advertise, so this may be derived rather than stored.')}
          title={t('Supported endpoints')}
        />

        <ChipSection
          emptyText={t('No enabled channel serves this model right now.')}
          items={channels.map((channel) => channel.name)}
          note={t('Computed on every read from the enabled channel abilities.')}
          title={t('Bound channels')}
          titles={channels.map((channel) => t('Channel type {{type}}', { type: channel.type }))}
        />

        <ChipSection
          emptyText={t('No group can reach it.')}
          items={groups}
          title={t('Enabled groups')}
        />

        <ChipSection
          emptyText={t('Not published, so it has no billing shape yet.')}
          items={quotaTypes.map((quotaType) => {
            const label = quotaTypeLabel(quotaType)
            return label === '' ? t('Quota type {{code}}', { code: quotaType }) : t(label)
          })}
          title={t('Billing')}
        />

        {model.name_rule === NAME_RULE.exact ? null : (
          <ChipSection
            emptyText={t('This rule matches nothing the gateway currently publishes.')}
            items={matched}
            note={t('{{count}} published model names match this rule, as counted by the server.', {
              count: model.matched_count ?? matched.length,
            })}
            title={t('Matched models')}
          />
        )}
      </div>
    )
  })()

  return (
    <Dialog
      description={t('Read-only. The lower sections are worked out by the server on every read and are not stored on the definition.')}
      footer={
        <Button onClick={() => props.onOpenChange(false)} variant="quiet">
          {t('Close')}
        </Button>
      }
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="md"
      title={t('Model definition')}
    >
      {body}
    </Dialog>
  )
}

type ChipSectionProps = {
  title: string
  items: string[]
  emptyText: string
  note?: string
  /** Optional `title` attribute per chip, same order as `items`. */
  titles?: string[]
}

function ChipSection(props: ChipSectionProps) {
  return (
    <section aria-label={props.title} className="flex flex-col gap-2">
      <h3 className="eyebrow">
        {props.title}
        {props.items.length === 0 ? null : (
          <span className="mono ml-2 text-muted">{formatNumber(props.items.length)}</span>
        )}
      </h3>
      {props.note === undefined ? null : (
        <p className="text-xs leading-5 text-muted">{props.note}</p>
      )}
      {props.items.length === 0 ? (
        <p className="text-xs leading-5 text-muted">{props.emptyText}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {props.items.map((item, index) => (
            <li key={`${item}-${String(index)}`}>
              <Badge className="mono" size="sm" title={props.titles?.[index]} tone="muted">
                {item}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
