import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import RotateCcwIcon from 'lucide-react/dist/esm/icons/rotate-ccw'
import Rows3Icon from 'lucide-react/dist/esm/icons/rows-3'
import SearchIcon from 'lucide-react/dist/esm/icons/search'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { ApiKeyCard } from '@/features/settings/components/ApiKeyCard'
import { ApiKeyEditorDialog } from '@/features/settings/components/ApiKeyEditorDialog'
import { initialApiKeys, modelGroupById } from '@/features/settings/data'
import type { ApiKeyDraft, ApiKeyRecord } from '@/features/settings/types'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'enabled' | 'disabled'

export function SettingsPage() {
  const { t } = useTranslation()
  const [apiKeys, setApiKeys] = useState(initialApiKeys)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedKeyIds, setExpandedKeyIds] = useState(() => new Set(initialApiKeys.map((apiKey) => apiKey.id)))
  const [visibleSecretIds, setVisibleSecretIds] = useState(() => new Set<string>())
  const [editorKeyId, setEditorKeyId] = useState<string | 'new' | null>(null)
  const normalizedQuery = query.trim().toLowerCase()

  const filteredKeys = useMemo(() => apiKeys.filter((apiKey) => {
    if (statusFilter === 'enabled' && !apiKey.active) return false
    if (statusFilter === 'disabled' && apiKey.active) return false
    if (normalizedQuery === '') return true
    if (apiKey.name.toLowerCase().includes(normalizedQuery)) return true
    return apiKey.groupIds.some((groupId) => modelGroupById.get(groupId)?.name.toLowerCase().includes(normalizedQuery))
  }), [apiKeys, normalizedQuery, statusFilter])

  const enabledCount = apiKeys.filter((apiKey) => apiKey.active).length
  const disabledCount = apiKeys.length - enabledCount
  const allExpanded = apiKeys.length > 0 && apiKeys.every((apiKey) => expandedKeyIds.has(apiKey.id))
  const editingKey = editorKeyId && editorKeyId !== 'new'
    ? apiKeys.find((apiKey) => apiKey.id === editorKeyId)
    : undefined

  const toggleExpanded = (keyId: string) => {
    setExpandedKeyIds((currentIds) => {
      const nextIds = new Set(currentIds)
      if (nextIds.has(keyId)) nextIds.delete(keyId)
      else nextIds.add(keyId)
      return nextIds
    })
  }

  const toggleSecret = (keyId: string) => {
    setVisibleSecretIds((currentIds) => {
      const nextIds = new Set(currentIds)
      if (nextIds.has(keyId)) nextIds.delete(keyId)
      else nextIds.add(keyId)
      return nextIds
    })
  }

  const toggleAllExpanded = () => {
    setExpandedKeyIds(allExpanded ? new Set() : new Set(apiKeys.map((apiKey) => apiKey.id)))
  }

  const saveApiKey = (draft: ApiKeyDraft) => {
    if (editingKey) {
      setApiKeys((currentKeys) => currentKeys.map((apiKey) => (
        apiKey.id === editingKey.id ? { ...apiKey, name: draft.name, groupIds: draft.groupIds } : apiKey
      )))
    } else {
      const timestamp = Date.now()
      const newKey: ApiKeyRecord = {
        id: `key-${timestamp}`,
        name: draft.name,
        secret: `sk-live-${timestamp.toString(36)}x7p9`,
        active: true,
        spent: 0,
        unlimitedQuota: true,
        created: new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
        expires: 'Never',
        groupIds: draft.groupIds,
      }
      setApiKeys((currentKeys) => [newKey, ...currentKeys])
      setExpandedKeyIds((currentIds) => new Set([newKey.id, ...currentIds]))
    }
    setEditorKeyId(null)
  }

  const resetFilters = () => {
    setQuery('')
    setStatusFilter('all')
  }

  const statusOptions: Array<{ count: number; id: StatusFilter; label: string }> = [
    { id: 'all', label: t('All keys'), count: apiKeys.length },
    { id: 'enabled', label: t('Enabled'), count: enabledCount },
    { id: 'disabled', label: t('Disabled'), count: disabledCount },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        action={<Button onClick={() => setEditorKeyId('new')}><PlusIcon aria-hidden="true" />{t('New API key')}</Button>}
        description={t('Keys, quotas, and model group routing.')}
        title={t('API keys')}
      />

      <section aria-label={t('API key filters')} className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div aria-label={t('Filter by status')} className="inline-flex w-full items-center rounded-[6px] border border-border bg-sidebar p-1 lg:w-auto" role="group">
            {statusOptions.map((option) => (
              <button
                aria-pressed={statusFilter === option.id}
                className={cn(
                  'flex min-h-9 flex-1 items-center justify-center gap-2 rounded-[4px] px-4 text-sm font-semibold transition-colors lg:flex-none',
                  statusFilter === option.id ? 'bg-surface-high text-primary' : 'text-muted hover:text-foreground',
                )}
                key={option.id}
                onClick={() => setStatusFilter(option.id)}
                type="button"
              >
                {option.label}
                <span className="mono rounded-full bg-background/60 px-2 py-0.5 text-[10px] text-muted">{option.count}</span>
              </button>
            ))}
          </div>

          <Button aria-label={allExpanded ? t('Collapse all keys') : t('Expand all keys')} onClick={toggleAllExpanded} title={allExpanded ? t('Collapse all keys') : t('Expand all keys')} variant="quiet">
            <Rows3Icon aria-hidden="true" />
            {allExpanded ? t('Collapse all') : t('Expand all')}
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="field relative flex h-10 min-w-0 flex-1 items-center">
            <SearchIcon aria-hidden="true" className="absolute left-3 size-4 text-muted" />
            <span className="sr-only">{t('Search key name or group')}</span>
            <input
              aria-label={t('Search key name or group')}
              className="h-full w-full bg-transparent pl-10 pr-3 text-sm outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('Search key name or group')}
              type="search"
              value={query}
            />
          </label>
          <Button disabled={query === '' && statusFilter === 'all'} onClick={resetFilters} variant="quiet">
            <RotateCcwIcon aria-hidden="true" />
            {t('Reset filters')}
          </Button>
        </div>
      </section>

      <section aria-label={t('API keys')} className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted">
          <p className="flex items-center gap-2"><KeyRoundIcon aria-hidden="true" className="size-4 text-primary" />{t('{{count}} keys', { count: filteredKeys.length })}</p>
          <p>{t('{{count}} group routes', { count: filteredKeys.reduce((total, apiKey) => total + apiKey.groupIds.length, 0) })}</p>
        </div>

        {filteredKeys.map((apiKey) => (
          <ApiKeyCard
            apiKey={apiKey}
            expanded={expandedKeyIds.has(apiKey.id)}
            key={apiKey.id}
            onDelete={() => setApiKeys((currentKeys) => currentKeys.filter((currentKey) => currentKey.id !== apiKey.id))}
            onEdit={() => setEditorKeyId(apiKey.id)}
            onToggleActive={() => setApiKeys((currentKeys) => currentKeys.map((currentKey) => (
              currentKey.id === apiKey.id ? { ...currentKey, active: !currentKey.active } : currentKey
            )))}
            onToggleExpanded={() => toggleExpanded(apiKey.id)}
            onToggleSecret={() => toggleSecret(apiKey.id)}
            secretVisible={visibleSecretIds.has(apiKey.id)}
          />
        ))}

        {filteredKeys.length === 0 ? (
          <div className="grid min-h-52 place-items-center border-y border-border text-center">
            <div>
              <KeyRoundIcon aria-hidden="true" className="mx-auto size-8 text-muted" />
              <p className="mt-3 text-sm text-muted">{t('No API keys match these filters.')}</p>
            </div>
          </div>
        ) : null}
      </section>

      {editorKeyId ? (
        <ApiKeyEditorDialog
          apiKey={editingKey}
          key={editorKeyId}
          onClose={() => setEditorKeyId(null)}
          onSave={saveApiKey}
        />
      ) : null}
    </div>
  )
}
