import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down'
import ChevronUpIcon from 'lucide-react/dist/esm/icons/chevron-up'
import SearchIcon from 'lucide-react/dist/esm/icons/search'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'

const logs = [
  { id: 'req_8f2a01', time: '10:42:18', model: 'gpt-4-turbo', key: 'Production_Main', latency: '842ms', tokens: '2,480', status: 200 },
  { id: 'req_8f29fc', time: '10:41:54', model: 'claude-3-opus', key: 'Staging_Env', latency: '1,204ms', tokens: '4,102', status: 200 },
  { id: 'req_8f29d8', time: '10:40:11', model: 'gemini-1.5-pro', key: 'Production_Main', latency: '326ms', tokens: '0', status: 429 },
  { id: 'req_8f297a', time: '10:38:46', model: 'mixtral-8x7b', key: 'Dev_Local_Testing', latency: '518ms', tokens: '1,024', status: 200 },
]

export function LogsPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const visibleLogs = useMemo(() => logs.filter((log) => (status === 'all' || String(log.status) === status) && `${log.id} ${log.model} ${log.key}`.toLowerCase().includes(query.toLowerCase())), [query, status])

  return (
    <div className="flex flex-col gap-8">
      <PageHeader description={t('Trace request outcomes, latency, token counts, and routing details.')} title={t('API logs')} />
      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-5 md:flex-row md:items-center md:justify-between">
          <label className="field relative flex h-10 w-full items-center md:max-w-sm"><SearchIcon aria-hidden="true" className="absolute left-3 size-4 text-muted" /><span className="sr-only">{t('Search logs')}</span><input aria-label={t('Search logs')} className="h-full w-full bg-transparent pl-10 pr-3 text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder={t('Search request, model, or key')} type="search" value={query} /></label>
          <label className="flex items-center gap-3 text-sm text-muted">{t('Status')}<select className="field px-3 text-sm" onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">{t('All statuses')}</option><option value="200">200</option><option value="429">429</option></select></label>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[860px] border-collapse text-left text-sm"><thead className="bg-surface-high/40 text-xs text-muted"><tr><th className="px-5 py-3">{t('Time')}</th><th className="px-5 py-3">{t('Request ID')}</th><th className="px-5 py-3">{t('Model')}</th><th className="px-5 py-3">{t('API key')}</th><th className="px-5 py-3">{t('Latency')}</th><th className="px-5 py-3">{t('Tokens')}</th><th className="px-5 py-3">{t('Status')}</th><th className="px-5 py-3" /></tr></thead><tbody>{visibleLogs.map((log) => <tr className="border-t border-border" key={log.id}><td className="mono px-5 py-4 text-muted">{log.time}</td><td className="mono px-5 py-4">{log.id}</td><td className="mono px-5 py-4">{log.model}</td><td className="mono px-5 py-4 text-muted">{log.key}</td><td className="mono px-5 py-4">{log.latency}</td><td className="mono px-5 py-4">{log.tokens}</td><td className="px-5 py-4"><Badge tone={log.status === 200 ? 'success' : 'warning'}>{log.status}</Badge></td><td className="px-5 py-4 text-right"><Button aria-expanded={expanded === log.id} aria-label={t('Toggle request details')} className="size-9 min-h-9 px-0" onClick={() => setExpanded((current) => current === log.id ? null : log.id)} title={t('Toggle request details')} variant="quiet">{expanded === log.id ? <ChevronUpIcon aria-hidden="true" /> : <ChevronDownIcon aria-hidden="true" />}</Button></td></tr>)}</tbody></table></div>
        {expanded && <div className="grid gap-4 border-t border-border bg-background/50 p-5 text-sm sm:grid-cols-3"><div><p className="eyebrow">{t('Route')}</p><p className="mono mt-2">openai-primary → openai-fallback</p></div><div><p className="eyebrow">{t('Region')}</p><p className="mono mt-2">us-east-1</p></div><div><p className="eyebrow">{t('Trace ID')}</p><p className="mono mt-2">trace_01J8F4K7</p></div></div>}
        {visibleLogs.length === 0 && <p className="p-10 text-center text-sm text-muted">{t('No request logs match these filters.')}</p>}
      </Panel>
    </div>
  )
}
