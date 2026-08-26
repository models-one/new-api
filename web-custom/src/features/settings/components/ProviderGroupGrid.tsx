import BoxesIcon from 'lucide-react/dist/esm/icons/boxes'
import BrainCircuitIcon from 'lucide-react/dist/esm/icons/brain-circuit'
import GemIcon from 'lucide-react/dist/esm/icons/gem'
import OrbitIcon from 'lucide-react/dist/esm/icons/orbit'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import SatelliteIcon from 'lucide-react/dist/esm/icons/satellite'
import WavesIcon from 'lucide-react/dist/esm/icons/waves'
import type { ComponentType, SVGProps } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { GroupRouteBadge } from '@/features/settings/components/GroupRouteBadge'
import { modelGroupById, providers } from '@/features/settings/data'
import type { ProviderId } from '@/features/settings/types'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const providerIcons: Record<ProviderId, IconComponent> = {
  openai: OrbitIcon,
  anthropic: BrainCircuitIcon,
  google: GemIcon,
  deepseek: WavesIcon,
  qwen: BoxesIcon,
  xai: SatelliteIcon,
}

type ProviderGroupGridProps = {
  groupIds: string[]
  onEdit: () => void
}

export function ProviderGroupGrid(props: ProviderGroupGridProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-1 border-t border-border bg-surface sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {providers.map((provider) => {
        const ProviderIcon = providerIcons[provider.id]
        const groups = props.groupIds
          .map((groupId) => modelGroupById.get(groupId))
          .filter((group) => group?.providerId === provider.id)

        return (
          <section
            className="min-w-0 border-b border-border bg-surface px-3 py-2.5 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0 xl:[&:nth-child(3n)]:border-r xl:[&:nth-child(4n)]:border-r-0"
            key={provider.id}
          >
            <div className="flex min-h-7 items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-[4px] border border-border bg-surface-high text-muted">
                <ProviderIcon aria-hidden="true" className="size-3.5" />
              </span>
              <h3 className="truncate text-sm font-semibold">{provider.name}</h3>
              <Button
                aria-label={`${t('Edit group routes')}: ${provider.name}`}
                className="ml-auto size-7 min-h-7 px-0"
                onClick={props.onEdit}
                title={t('Edit group routes')}
                variant="quiet"
              >
                <PencilIcon aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-2 flex min-h-6 flex-wrap gap-1.5">
              {groups.length > 0 ? groups.map((group) => (
                group ? <GroupRouteBadge compact group={group} key={group.id} /> : null
              )) : (
                <span className="inline-flex items-center rounded-[4px] border border-destructive/20 bg-destructive/8 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                  {t('Disabled')}
                </span>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
