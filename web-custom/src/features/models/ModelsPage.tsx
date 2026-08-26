import BotIcon from 'lucide-react/dist/esm/icons/bot'
import BrainCircuitIcon from 'lucide-react/dist/esm/icons/brain-circuit'
import CpuIcon from 'lucide-react/dist/esm/icons/cpu'
import ListFilterIcon from 'lucide-react/dist/esm/icons/list-filter'
import SearchIcon from 'lucide-react/dist/esm/icons/search'
import ScaleIcon from 'lucide-react/dist/esm/icons/scale'
import type { ComponentType, SVGProps } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'

type ModelInfo = {
  name: string
  provider: string
  descriptionKey: string
  context: string
  input: string
  output: string
  tags: string[]
  featured?: boolean
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const models: ModelInfo[] = [
  { name: 'GPT-4 Turbo', provider: 'OpenAI', descriptionKey: 'Broad reasoning model for complex instruction following and production workloads.', context: '128K', input: '$10.00', output: '$30.00', tags: ['Chat', 'Reasoning', 'Vision'], featured: true, icon: BotIcon },
  { name: 'Claude 3 Opus', provider: 'Anthropic', descriptionKey: 'High-capability model for nuanced analysis, coding, and long-form tasks.', context: '200K', input: '$15.00', output: '$75.00', tags: ['Analysis', 'Coding', 'Long context'], icon: BrainCircuitIcon },
  { name: 'Gemini 1.5 Pro', provider: 'Google', descriptionKey: 'Multimodal model optimized for large documents and mixed media inputs.', context: '1M', input: '$7.00', output: '$21.00', tags: ['Multimodal', 'Vision', 'Long context'], icon: CpuIcon },
]

export function ModelsPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [featuredOnly, setFeaturedOnly] = useState(false)
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const visibleModels = useMemo(() => models.filter((model) => model.name.toLowerCase().includes(query.toLowerCase()) && (!featuredOnly || model.featured)), [featuredOnly, query])

  const toggleModel = (name: string) => {
    setSelectedModels((current) => current.includes(name) ? current.filter((model) => model !== name) : [...current, name].slice(-2))
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader description={t('Compare capabilities, context windows, and pricing across available routes.')} title={t('Explore models')} />
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <label className="field relative flex h-11 w-full items-center sm:w-80"><SearchIcon aria-hidden="true" className="absolute left-3 size-4 text-muted" /><span className="sr-only">{t('Search models')}</span><input aria-label={t('Search models')} className="h-full w-full bg-transparent pl-10 pr-3 text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder={t('Search models')} type="search" value={query} /></label>
        <Button aria-pressed={featuredOnly} onClick={() => setFeaturedOnly((enabled) => !enabled)} variant={featuredOnly ? 'primary' : 'outline'}><ListFilterIcon aria-hidden="true" />{t('Featured only')}</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {visibleModels.map((model) => {
          const Icon = model.icon
          const selected = selectedModels.includes(model.name)
          return <Panel className="flex min-h-[430px] flex-col p-6" key={model.name}>
            <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-[4px] border border-primary/25 bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-5" /></span><div><h2 className="text-lg font-bold">{model.name}</h2><p className="text-sm text-muted">{model.provider}</p></div></div>{model.featured && <Badge tone="primary">{t('Featured')}</Badge>}</div>
            <p className="mt-6 min-h-20 text-sm leading-6 text-muted">{t(model.descriptionKey)}</p>
            <dl className="mt-5 divide-y divide-border border-y border-border text-sm"><div className="flex justify-between py-3"><dt className="text-muted">{t('Context window')}</dt><dd className="mono font-semibold">{model.context} {t('tokens')}</dd></div><div className="grid grid-cols-2 divide-x divide-border py-3"><div><dt className="text-xs text-muted">{t('Input per 1M')}</dt><dd className="mono mt-1 text-primary">{model.input}</dd></div><div className="pl-4"><dt className="text-xs text-muted">{t('Output per 1M')}</dt><dd className="mono mt-1 text-secondary">{model.output}</dd></div></div></dl>
            <div className="mt-5 flex flex-wrap gap-2">{model.tags.map((tag) => <Badge key={tag} tone="muted">{t(tag)}</Badge>)}</div>
            <Button aria-pressed={selected} className="mt-auto w-full" onClick={() => toggleModel(model.name)} variant={selected ? 'primary' : 'outline'}>{t(selected ? 'Selected' : 'Select model')}</Button>
          </Panel>
        })}
      </div>

      {visibleModels.length === 0 && <Panel className="p-10 text-center" muted><p className="text-muted">{t('No models match this search.')}</p></Panel>}

      <Panel className="flex min-h-40 flex-col items-center justify-center border-dashed p-8 text-center" muted>
        <ScaleIcon aria-hidden="true" className="size-6 text-muted" />
        <h2 className="mt-4 text-lg font-bold">{selectedModels.length === 0 ? t('Select models to compare') : t('Comparison ready')}</h2>
        <p className="mt-2 text-sm text-muted">{selectedModels.length === 0 ? t('Choose up to two models to prepare a side-by-side comparison.') : selectedModels.join(' / ')}</p>
      </Panel>
    </div>
  )
}
