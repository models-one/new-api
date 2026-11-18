/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/overlay/Dialog'
import { Button } from '@/components/ui/Button'
import { NativeSelect } from '@/components/form/NativeSelect'
import { Input } from '@/components/form/Input'
import { Switch } from '@/components/form/Switch'
import { Textarea } from '@/components/form/Textarea'
import { channelsQuery, EMPTY_CHANNEL_FILTERS, fetchChannel } from '@/features/channels/api'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

import { errorDetails, pelicanKeys, saveRule } from './api'
import type { PelicanProtocol, PelicanRule } from './types'

export function RuleEditor(props: { rule: PelicanRule; onClose: () => void }) {
  const { t } = useTranslation()
  const cache = useQueryClient()
  const [rule, setRule] = useState(props.rule)
  const [search, setSearch] = useState('')
  const [validation, setValidation] = useState('')
  const queryText = useDebouncedValue(search, 250)
  const channels = useQuery(
    channelsQuery({ ...EMPTY_CHANNEL_FILTERS, keyword: queryText }, 1, 100, {}),
  )
  const channel = useQuery({
    queryKey: ['pelican-channel', rule.channel_id],
    queryFn: () => fetchChannel(rule.channel_id),
    enabled: rule.channel_id > 0,
  })
  const options = (channels.data?.items ?? []).map((item) => ({
    value: String(item.id),
    label: `${item.name} (#${item.id})`,
  }))
  if (channel.data && !options.some((item) => item.value === String(channel.data?.id))) {
    options.unshift({
      value: String(channel.data.id),
      label: `${channel.data.name} (#${channel.data.id})`,
    })
  }
  const models = (channel.data?.models ?? '')
    .split(',')
    .filter(Boolean)
    .map((model) => ({ value: model, label: model }))
  const save = useMutation({
    mutationFn: saveRule,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: pelicanKeys.all })
      props.onClose()
    },
  })
  function setProtocol(protocol: PelicanProtocol) {
    setRule((current) => ({
      ...current,
      protocol,
      parameters:
        protocol === 'openai-responses' ? '{"max_output_tokens":8192}' : '{"max_tokens":8192}',
    }))
  }
  function submit(event: React.FormEvent) {
    event.preventDefault()
    try {
      const parameters: unknown = JSON.parse(rule.parameters)
      if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
        throw new Error(t('Parameters must be a JSON object'))
      }
      if (!rule.channel_id || !rule.model || !rule.prompt.trim() || !rule.name.trim()) {
        throw new Error(t('Complete the channel, model, name and prompt'))
      }
      if (
        rule.interval_seconds !== 0 &&
        (rule.interval_seconds < 300 || rule.interval_seconds > 2592000)
      ) {
        throw new Error(t('Interval must be 5 minutes to 30 days, or zero for manual mode'))
      }
      setValidation('')
      save.mutate(rule)
    } catch (error) {
      if (error instanceof SyntaxError) {
        setValidation(t('Parameters must be a JSON object'))
      } else {
        setValidation(error instanceof Error ? error.message : String(error))
      }
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={rule.id ? t('Edit test rule') : t('Create test rule')}
      size="lg"
    >
      <form className="space-y-4" onSubmit={submit}>
        {(channels.isError || channel.isError) && (
          <pre
            role="alert"
            className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-destructive"
          >
            {errorDetails(channels.error ?? channel.error)}
          </pre>
        )}
        <div className="space-y-2">
          <Input
            id="pelican-name"
            label={t('Name')}
            maxLength={120}
            required
            value={rule.name}
            onChange={(event) => setRule((current) => ({ ...current, name: event.target.value }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Input
              id="pelican-channel-search"
              label={t('Search channels')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <NativeSelect
              id="pelican-channel"
              label={t('Channel')}
              options={options}
              value={rule.channel_id ? String(rule.channel_id) : ''}
              onChange={(event) =>
                setRule((current) => ({
                  ...current,
                  channel_id: Number(event.target.value),
                  model: '',
                }))
              }
              placeholder={t('Select channel')}
            />
          </div>
          <div className="space-y-2">
            <NativeSelect
              id="pelican-model"
              label={t('Model')}
              options={models}
              disabled={!rule.channel_id || channel.isLoading}
              value={rule.model}
              onChange={(event) =>
                setRule((current) => ({
                  ...current,
                  model: event.target.value,
                }))
              }
              placeholder={t('Select model')}
            />
            <NativeSelect
              id="pelican-protocol"
              label={t('Protocol')}
              options={['openai-chat', 'openai-responses', 'anthropic'].map((value) => ({
                value,
                label: value,
              }))}
              value={rule.protocol}
              onChange={(event) => setProtocol(event.target.value as PelicanProtocol)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Textarea
            id="pelican-prompt"
            label={t('Prompt')}
            rows={4}
            required
            maxLength={100000}
            value={rule.prompt}
            onChange={(event) => setRule((current) => ({ ...current, prompt: event.target.value }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Input
              id="pelican-interval"
              label={t('Interval (minutes)')}
              type="number"
              min={0}
              max={43200}
              step={1}
              value={rule.interval_seconds / 60}
              onChange={(event) =>
                setRule((current) => ({
                  ...current,
                  interval_seconds: Number(event.target.value) * 60,
                }))
              }
            />
            <p className="text-muted text-xs">
              {t('Zero means manual only. Automatic tests start after one interval.')}
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Switch
                label={t('Automatic testing')}
                checked={rule.enabled}
                onCheckedChange={(enabled) => setRule((current) => ({ ...current, enabled }))}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Switch
                label={t('Visible to users')}
                checked={rule.published}
                onCheckedChange={(published) => setRule((current) => ({ ...current, published }))}
              />
            </div>
          </div>
        </div>
        <details className="rounded-lg border p-3">
          <summary>{t('Advanced Settings')}</summary>
          <div className="mt-3 space-y-3">
            <Textarea
              id="pelican-system"
              label={t('System Prompt')}
              rows={3}
              value={rule.system_prompt}
              onChange={(event) =>
                setRule((current) => ({
                  ...current,
                  system_prompt: event.target.value,
                }))
              }
            />
            <Textarea
              id="pelican-parameters"
              label={t('Parameters')}
              textareaClassName="font-mono"
              rows={4}
              value={rule.parameters}
              onChange={(event) =>
                setRule((current) => ({
                  ...current,
                  parameters: event.target.value,
                }))
              }
            />
          </div>
        </details>
        {(validation || save.error) && (
          <pre
            role="alert"
            className="text-destructive max-h-48 overflow-auto text-sm break-all whitespace-pre-wrap"
          >
            {validation || errorDetails(save.error)}
          </pre>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {t('Save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
