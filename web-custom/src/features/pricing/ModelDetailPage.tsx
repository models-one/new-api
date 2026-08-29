import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import ChevronLeftIcon from 'lucide-react/dist/esm/icons/chevron-left'
import LockIcon from 'lucide-react/dist/esm/icons/lock'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs } from '@/components/disclosure'
import { NativeSelect, type NativeSelectOption } from '@/components/form'
import { toErrorMessage } from '@/components/overlay'
import { EmptyState } from '@/components/system/EmptyState'
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  DescriptionList,
  PageHeader,
  Panel,
  Skeleton,
  type DescriptionListItem,
} from '@/components/ui'
import { BillingPanel } from '@/features/pricing/components/BillingPanel'
import { GroupPriceTable } from '@/features/pricing/components/GroupPriceTable'
import { ModelPerformancePanel } from '@/features/pricing/components/ModelPerformancePanel'
import { PublicFrame } from '@/features/pricing/components/PublicFrame'
import { pricingModuleAccess } from '@/features/pricing/module-access'
import {
  ANY_GROUP,
  autoGroupChain,
  billingShape,
  endpointRoute,
  fallbackMultipliers,
  formatMultiplier,
  modelEndpointTypes,
  modelGroups,
  modelMultipliers,
  resolveGroupRatio,
  selectableGroups,
  type ModelMultiplier,
} from '@/features/pricing/pricing-presentation'
import { publicPricingQuery } from '@/features/pricing/public-queries'
import { useServerStatus } from '@/hooks/use-server-status'
import { parseTags, vendorName } from '@/lib/api/pricing'
import { getLegacySignInHref } from '@/lib/navigation'

const BILLING_SHAPE_LABELS = {
  'per-token': 'Token-based',
  'per-request': 'Per request',
  tiered: 'Tiered pricing',
} as const

function BadgeList(props: {
  items: readonly string[]
  titleOf?: (item: string) => string | undefined
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {props.items.map((item) => (
        <li key={item}>
          <Badge className="mono" title={props.titleOf?.(item)} tone="muted">
            {item}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

function MultiplierList(props: { entries: readonly ModelMultiplier[] }) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-wrap gap-2">
      {props.entries.map((multiplier) => (
        <li key={multiplier.id}>
          <Badge tone="muted">
            {t(multiplier.labelKey)}
            <span className="mono">{formatMultiplier(multiplier.ratio)}</span>
          </Badge>
        </li>
      ))}
    </ul>
  )
}

/**
 * The full-page model detail, public like the square it links from.
 *
 * Everything shown here comes off the same `/api/pricing` row the square rendered; only the
 * performance tab reaches for a second (also public) endpoint.
 */
export function ModelDetailPage() {
  const { t } = useTranslation()
  const params = useParams({ strict: false })
  // The path segment is percent-encoded, because a model name may contain a slash.
  const rawParam = typeof params.modelId === 'string' ? params.modelId : ''
  const modelName = useMemo(() => {
    try {
      return decodeURIComponent(rawParam)
    } catch {
      // A hand-typed URL can carry a stray `%`; the raw segment is still the best guess.
      return rawParam
    }
  }, [rawParam])

  const status = useServerStatus()
  const access = pricingModuleAccess(status.data)
  const moduleReady = status.isSuccess && access.enabled

  const pricing = useQuery({ ...publicPricingQuery(), enabled: moduleReady })
  const [groupChoice, setGroupChoice] = useState<string>(ANY_GROUP)

  const payload = pricing.data
  const groups = useMemo(() => selectableGroups(payload), [payload])
  const model = useMemo(
    () => (payload?.data ?? []).find((candidate) => candidate.model_name === modelName),
    [payload, modelName],
  )

  const backLink = (
    <nav aria-label={t('Breadcrumb')}>
      <Link
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        to="/pricing"
      >
        <ChevronLeftIcon aria-hidden="true" className="size-4" />
        {t('All models')}
      </Link>
    </nav>
  )

  if (status.isLoading || (moduleReady && pricing.isLoading)) {
    return (
      <PublicFrame>
        <div className="flex flex-col gap-8">
          {backLink}
          <Skeleton className="h-96" label={t('Loading model pricing')} variant="block" />
        </div>
      </PublicFrame>
    )
  }

  if (status.isSuccess && !access.enabled) {
    return (
      <PublicFrame>
        <div className="flex flex-col gap-8">
          {backLink}
          <Panel>
            <EmptyState
              description={t('This gateway has turned the public pricing page off.')}
              title={t('Pricing is not published here')}
            />
          </Panel>
        </div>
      </PublicFrame>
    )
  }

  if (status.isError || pricing.isError) {
    const signInRequired = pricing.isError && access.requireAuth
    return (
      <PublicFrame>
        <div className="flex flex-col gap-8">
          {backLink}
          {signInRequired ? (
            <Alert
              action={
                <Button render={<a href={getLegacySignInHref()} />} variant="outline">
                  {t('Sign in')}
                </Button>
              }
              icon={<LockIcon aria-hidden="true" />}
              title={t('Sign in to see pricing')}
              tone="info"
            >
              {t('This gateway publishes pricing to signed-in visitors only.')}
            </Alert>
          ) : (
            <Alert
              action={
                <Button
                  aria-busy={pricing.isFetching || status.isFetching}
                  disabled={pricing.isFetching || status.isFetching}
                  onClick={() => {
                    if (status.isError) void status.refetch()
                    if (pricing.isError) void pricing.refetch()
                  }}
                  variant="outline"
                >
                  {t('Try again')}
                </Button>
              }
              icon={<TriangleAlertIcon aria-hidden="true" />}
              title={t('Could not load the model catalogue')}
              tone="destructive"
            >
              {toErrorMessage(status.error ?? pricing.error)}
            </Alert>
          )}
        </div>
      </PublicFrame>
    )
  }

  if (model === undefined) {
    return (
      <PublicFrame>
        <div className="flex flex-col gap-8">
          {backLink}
          <Panel>
            <EmptyState
              action={
                <Button render={<Link to="/pricing" />} variant="outline">
                  {t('Browse all models')}
                </Button>
              }
              description={t('“{{model}}” is not published by this gateway.', { model: modelName })}
              title={t('Model not found')}
            />
          </Panel>
        </div>
      </PublicFrame>
    )
  }

  const vendors = payload?.vendors ?? []
  const endpointCatalog = payload?.supported_endpoint ?? {}
  const groupRatio = payload?.group_ratio ?? {}
  const provider = vendorName(model, vendors)
  const endpoints = modelEndpointTypes(model)
  const enabledGroups = modelGroups(model)
  const tags = parseTags(model)
  const multipliers = modelMultipliers(model)
  const fallbacks = fallbackMultipliers(model)
  const autoChain = autoGroupChain(model, payload?.auto_groups ?? [])
  const resolved = resolveGroupRatio(model, groupChoice, groupRatio)

  const groupOptions: NativeSelectOption[] = [
    { value: ANY_GROUP, label: t('Best available group') },
    ...groups.map((group) => ({
      value: group.name,
      label:
        group.description === '' || group.description === group.name
          ? group.name
          : `${group.name} · ${group.description}`,
      // A group this model is not enabled for stays listed, and stays unselectable.
      disabled: !enabledGroups.includes(group.name),
    })),
  ]

  const attributes: DescriptionListItem[] = [
    {
      id: 'provider',
      term: t('Provider'),
      description: provider === '' ? t('Provider not published') : provider,
    },
    {
      id: 'billing',
      term: t('Billing'),
      description: t(BILLING_SHAPE_LABELS[billingShape(model)]),
    },
  ]

  if (model.owner_by !== '') {
    attributes.push({ id: 'owner', term: t('Owned by'), description: model.owner_by })
  }
  if (endpoints.length > 0) {
    attributes.push({
      id: 'endpoints',
      term: t('Endpoints'),
      description: (
        <BadgeList items={endpoints} titleOf={(type) => endpointRoute(endpointCatalog, type)} />
      ),
    })
  }
  if (enabledGroups.length > 0) {
    attributes.push({
      id: 'groups',
      term: t('Available groups'),
      description: <BadgeList items={enabledGroups} />,
    })
  }
  if (autoChain.length > 0) {
    attributes.push({
      id: 'auto',
      term: t('Auto group fallback order'),
      description: <BadgeList items={autoChain} />,
    })
  }
  if (tags.length > 0) {
    attributes.push({ id: 'tags', term: t('Tags'), description: <BadgeList items={tags} /> })
  }
  if (multipliers.length > 0) {
    attributes.push({
      id: 'multipliers',
      term: t('Billing multipliers'),
      description: <MultiplierList entries={multipliers} />,
    })
  }
  if (fallbacks.length > 0) {
    attributes.push({
      id: 'fallback-multipliers',
      term: t('Fallback multipliers'),
      description: (
        <div className="flex flex-col gap-2">
          <MultiplierList entries={fallbacks} />
          <p className="text-xs text-muted">
            {t('Used only if the billing expression cannot be evaluated for a request.')}
          </p>
        </div>
      ),
    })
  }
  if (model.pricing_version !== undefined && model.pricing_version !== '') {
    attributes.push({
      id: 'version',
      term: t('Pricing version'),
      description: <span className="mono text-xs">{model.pricing_version}</span>,
    })
  }

  return (
    <PublicFrame>
      <div className="flex flex-col gap-8">
        <PageHeader
          action={
            <CopyButton
              label={t('Copy model name')}
              showLabel
              value={model.model_name}
              variant="outline"
            />
          }
          breadcrumb={backLink}
          description={
            model.description === undefined || model.description === ''
              ? undefined
              : model.description
          }
          eyebrow={t('Model pricing')}
          title={model.model_name}
        />

        <NativeSelect
          className="sm:max-w-sm"
          description={t('Prices below are multiplied by the selected group ratio.')}
          label={t('Quote prices for')}
          onChange={(event) => setGroupChoice(event.target.value)}
          options={groupOptions}
          value={groupChoice}
        />

        <Tabs defaultValue="overview">
          <Tabs.List label={t('Model detail sections')}>
            <Tabs.Tab value="overview">{t('Overview')}</Tabs.Tab>
            <Tabs.Tab value="groups">{t('Pricing by group')}</Tabs.Tab>
            <Tabs.Tab value="performance">{t('Performance')}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel className="flex flex-col gap-6" value="overview">
            <BillingPanel model={model} resolved={resolved} />
            <Panel>
              <Panel.Header headingLevel={2} title={t('Model attributes')} />
              <Panel.Body>
                <DescriptionList items={attributes} label={t('Model attributes')} layout="stacked" />
              </Panel.Body>
            </Panel>
          </Tabs.Panel>

          <Tabs.Panel value="groups">
            <Panel>
              <Panel.Header
                description={t('Every group this model is enabled for, at that group’s ratio.')}
                headingLevel={2}
                title={t('Pricing by group')}
              />
              <Panel.Body padded={false}>
                <GroupPriceTable autoChain={autoChain} groups={groups} model={model} />
              </Panel.Body>
            </Panel>
          </Tabs.Panel>

          <Tabs.Panel value="performance">
            <ModelPerformancePanel modelName={model.model_name} />
          </Tabs.Panel>
        </Tabs>
      </div>
    </PublicFrame>
  )
}
