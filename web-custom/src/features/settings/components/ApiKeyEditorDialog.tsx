import ArrowDownIcon from 'lucide-react/dist/esm/icons/arrow-down'
import ArrowUpIcon from 'lucide-react/dist/esm/icons/arrow-up'
import CheckIcon from 'lucide-react/dist/esm/icons/check'
import XIcon from 'lucide-react/dist/esm/icons/x'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { GroupRouteBadge } from '@/features/settings/components/GroupRouteBadge'
import { modelGroupById, modelGroups, providers } from '@/features/settings/data'
import type { ApiKeyDraft, ApiKeyRecord } from '@/features/settings/types'
import { cn } from '@/lib/utils'

type ApiKeyEditorDialogProps = {
  apiKey?: ApiKeyRecord
  onClose: () => void
  onSave: (draft: ApiKeyDraft) => void
}

export function ApiKeyEditorDialog(props: ApiKeyEditorDialogProps) {
  const { t } = useTranslation()
  const onClose = props.onClose
  const [name, setName] = useState(props.apiKey?.name ?? '')
  const [selectedGroupIds, setSelectedGroupIds] = useState(props.apiKey?.groupIds ?? [])
  const canSave = name.trim().length > 0 && selectedGroupIds.length > 0

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((currentGroups) => {
      if (currentGroups.includes(groupId)) {
        return currentGroups.filter((currentGroupId) => currentGroupId !== groupId)
      }
      return [...currentGroups, groupId]
    })
  }

  const moveGroup = (groupId: string, offset: -1 | 1) => {
    setSelectedGroupIds((currentGroups) => {
      const currentIndex = currentGroups.indexOf(groupId)
      const targetIndex = currentIndex + offset
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= currentGroups.length) {
        return currentGroups
      }
      const nextGroups = [...currentGroups]
      nextGroups[currentIndex] = nextGroups[targetIndex]
      nextGroups[targetIndex] = groupId
      return nextGroups
    })
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => {
      if (event.target === event.currentTarget) props.onClose()
    }}>
      <section
        aria-labelledby="api-key-editor-title"
        aria-modal="true"
        className="panel flex max-h-[min(860px,calc(100svh-2rem))] w-full max-w-4xl flex-col overflow-hidden"
        role="dialog"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <h2 className="text-xl font-bold" id="api-key-editor-title">
            {props.apiKey ? t('Edit API key') : t('New API key')}
          </h2>
          <Button aria-label={t('Close')} className="size-9 min-h-9 px-0" onClick={props.onClose} title={t('Close')} variant="quiet">
            <XIcon aria-hidden="true" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t('Key name')}
            <input
              aria-label={t('Key name')}
              autoFocus
              className="field px-3 text-sm font-normal"
              maxLength={50}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('API key name')}
              value={name}
            />
          </label>

          <section className="mt-6 border-y border-border py-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-bold">{t('Group priority')}</h3>
              <span className="mono text-xs text-muted">{t('{{count}} groups selected', { count: selectedGroupIds.length })}</span>
            </div>
            {selectedGroupIds.length > 0 ? (
              <ol className="mt-3 flex flex-col gap-2">
                {selectedGroupIds.map((groupId, index) => {
                  const group = modelGroupById.get(groupId)
                  if (!group) return null
                  return (
                    <li className="flex min-w-0 items-center gap-2 rounded-[4px] border border-border bg-surface-high/40 p-2" key={group.id}>
                      <span className="mono grid size-7 shrink-0 place-items-center text-xs text-muted">{index + 1}</span>
                      <GroupRouteBadge className="min-w-0" group={group} />
                      <div className="ml-auto flex shrink-0 gap-1">
                        <Button aria-label={`${t('Move group up')}: ${group.name}`} className="size-8 min-h-8 px-0" disabled={index === 0} onClick={() => moveGroup(group.id, -1)} title={t('Move group up')} variant="quiet">
                          <ArrowUpIcon aria-hidden="true" />
                        </Button>
                        <Button aria-label={`${t('Move group down')}: ${group.name}`} className="size-8 min-h-8 px-0" disabled={index === selectedGroupIds.length - 1} onClick={() => moveGroup(group.id, 1)} title={t('Move group down')} variant="quiet">
                          <ArrowDownIcon aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-destructive">{t('Select at least one group.')}</p>
            )}
          </section>

          <section className="mt-5">
            <h3 className="text-sm font-bold">{t('Available model groups')}</h3>
            <div className="mt-3 divide-y divide-border border-y border-border">
              {providers.map((provider) => {
                const providerGroups = modelGroups.filter((group) => group.providerId === provider.id)
                return (
                  <div className="grid gap-3 py-4 sm:grid-cols-[150px_1fr] sm:items-start" key={provider.id}>
                    <p className="pt-2 text-sm font-semibold text-foreground">{provider.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {providerGroups.map((group) => {
                        const selected = selectedGroupIds.includes(group.id)
                        return (
                          <button
                            aria-checked={selected}
                            aria-label={`${group.name} x${group.ratio}`}
                            className={cn(
                              'inline-flex min-h-10 items-center gap-2 rounded-[4px] border px-3 py-2 text-left text-xs font-semibold transition-colors',
                              selected ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-surface-high/40 text-muted hover:border-border-strong hover:text-foreground',
                            )}
                            key={group.id}
                            onClick={() => toggleGroup(group.id)}
                            role="checkbox"
                            type="button"
                          >
                            <span className={cn('grid size-4 place-items-center border', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface')}>
                              {selected ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
                            </span>
                            <span>{group.name}</span>
                            <span className="mono text-[10px] opacity-80">x{group.ratio}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button onClick={props.onClose} variant="quiet">{t('Cancel')}</Button>
          <Button disabled={!canSave} onClick={() => props.onSave({ name: name.trim(), groupIds: selectedGroupIds })}>
            {props.apiKey ? t('Update key') : t('Create key')}
          </Button>
        </footer>
      </section>
    </div>
  )
}
