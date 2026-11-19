import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import RotateCcwIcon from 'lucide-react/dist/esm/icons/rotate-ccw'
import XIcon from 'lucide-react/dist/esm/icons/x'

import { Input, SearchInput, Textarea } from '@/components/form'
import { toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, Panel } from '@/components/ui'
import {
  parseStoredToolPrices,
  rowsFromStored,
  writeToolPrices,
  type ToolPriceIssue,
  type ToolPriceRow,
} from '@/features/system-settings/billing/tool-prices'
import {
  readOptionString,
  systemOptionsQuery,
  useInvalidateSystemOptions,
  writeSystemOption,
} from '@/features/system-settings/options-store'

const OPTION_KEY = 'tool_price_setting.prices'

/**
 * `tool_price_setting.prices`: per-call prices of built-in tools. Built-in prices are shown
 * for reference and only the operator's overrides and additions are stored (see
 * `tool-prices.ts`). Mounted once the options have loaded, so the draft starts from them.
 */
export function ToolPricesPanel() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())
  if (optionsQuery.isPending) return <p className="text-sm text-muted">{t('Loading…')}</p>
  if (optionsQuery.isError) return <Alert tone="destructive">{toErrorMessage(optionsQuery.error)}</Alert>
  return <ToolPricesEditor stored={readOptionString(optionsQuery.data, OPTION_KEY, '{}')} />
}

function ToolPricesEditor(props: { stored: string }) {
  const { t } = useTranslation()
  const invalidateOptions = useInvalidateSystemOptions()
  const storedPrices = parseStoredToolPrices(props.stored)
  const [rows, setRows] = useState<ToolPriceRow[]>(() => rowsFromStored(storedPrices ?? {}))
  const [nextId, setNextId] = useState(() => rows.length + 1)
  const [view, setView] = useState<'table' | 'json'>(storedPrices === null ? 'json' : 'table')
  const [json, setJson] = useState(props.stored)
  const [search, setSearch] = useState('')
  const [showProblems, setShowProblems] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const written = writeToolPrices(rows)
  const jsonPrices = parseStoredToolPrices(json)
  const target = view === 'table' ? written.prices : (jsonPrices ?? undefined)
  const savedText = JSON.stringify(storedPrices ?? {})
  const unchanged = target !== undefined && JSON.stringify(target) === savedText
  const issues: ToolPriceIssue[] = showProblems ? written.issues : []
  const issueOf = (id: number, field: ToolPriceIssue['field']) => {
    const issue = issues.find((item) => item.id === id && item.field === field)
    return issue === undefined ? undefined : t(issue.message)
  }

  function patch(id: number, next: Partial<ToolPriceRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...next } : row)))
    setError(null)
  }

  async function save() {
    setShowProblems(true)
    if (target === undefined || unchanged) return
    setSaving(true)
    setError(null)
    try {
      await writeSystemOption({ key: OPTION_KEY, value: JSON.stringify(target) })
      toast.success(t('Tool prices saved'))
      await invalidateOptions()
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  const needle = search.trim().toLowerCase()
  const visible = rows.filter((row) => needle === '' || `${row.tool}:${row.model}`.toLowerCase().includes(needle))

  return (
    <Panel as="section">
      <Panel.Header
        description={t('An extra charge for each call to a built-in tool such as web search, in USD per 1,000 calls. A price for a model prefix wins over the tool’s own price for models that start with it; 0 makes the calls free.')}
        title={t('Tool prices')}
      />
      <Panel.Body className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {view === 'table' ? <SearchInput className="max-w-xs" hideLabel label={t('Search tools')} onValueChange={setSearch} placeholder={t('Search tools')} value={search} /> : null}
          <Button
            className="ml-auto"
            disabled={view === 'json' && jsonPrices === null}
            onClick={() => {
              if (view === 'table') {
                setJson(JSON.stringify(written.prices ?? storedPrices ?? {}, null, 2))
                setView('json')
              } else if (jsonPrices !== null) {
                const next = rowsFromStored(jsonPrices)
                setRows(next)
                setNextId(next.length + 1)
                setView('table')
              }
            }}
            size="sm"
            variant="quiet"
          >
            {view === 'table' ? t('Edit as JSON') : t('Edit as a table')}
          </Button>
        </div>

        {storedPrices === null ? (
          <Alert tone="warning">{t('The stored tool prices are not a JSON object of non-negative numbers. Fix them as JSON before using the table.')}</Alert>
        ) : null}

        {view === 'json' ? (
          <Textarea
            description={t('Only your overrides and additions, as {"tool": price} or {"tool:model-prefix*": price}. Built-in prices apply to every tool not listed here.')}
            error={jsonPrices === null ? t('Enter a JSON object of non-negative numbers.') : undefined}
            label={t('Tool price overrides')}
            onChange={(event) => setJson(event.target.value)}
            rows={10}
            spellCheck={false}
            textareaClassName="mono text-xs"
            value={json}
          />
        ) : (
          <div className="overflow-x-auto">
            <table aria-label={t('Tool prices')} className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 pr-2 font-medium">{t('Tool')}</th>
                  <th className="py-1 pr-2 font-medium">{t('Models (prefix)')}</th>
                  <th className="py-1 pr-2 font-medium">{t('USD / 1K calls')}</th>
                  <th className="py-1 pr-2 font-medium">{t('Source')}</th>
                  <th className="py-1 font-medium">
                    <span className="sr-only">{t('Actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const builtIn = row.builtIn !== undefined
                  const label = row.model === '' ? row.tool || t('new tool') : `${row.tool}:${row.model}`
                  return (
                    <tr className="border-t border-border align-top" key={row.id}>
                      <td className="py-2 pr-2">
                        {builtIn ? (
                          <span className="mono text-xs">{row.tool}</span>
                        ) : (
                          <Input error={issueOf(row.id, 'tool')} hideLabel inputClassName="mono" label={t('Tool name of {{key}}', { key: label })} onChange={(event) => patch(row.id, { tool: event.target.value })} placeholder="web_search" size="sm" value={row.tool} />
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        {builtIn ? (
                          <span className="mono text-xs text-muted">{row.model || t('All models')}</span>
                        ) : (
                          <Input error={issueOf(row.id, 'model')} hideLabel inputClassName="mono" label={t('Model prefix of {{key}}', { key: label })} onChange={(event) => patch(row.id, { model: event.target.value })} placeholder={t('All models')} size="sm" value={row.model} />
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          error={issueOf(row.id, 'price')}
                          hideLabel
                          inputMode="decimal"
                          label={t('Price of {{key}}', { key: label })}
                          onChange={(event) => patch(row.id, { overridden: true, price: event.target.value })}
                          size="sm"
                          value={row.price}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        {builtIn && !row.overridden ? <Badge tone="muted">{t('Built-in')}</Badge> : null}
                        {builtIn && row.overridden ? <Badge tone="info">{t('Overrides built-in {{price}}', { price: row.builtIn })}</Badge> : null}
                        {builtIn ? null : <Badge tone="success">{t('Added')}</Badge>}
                      </td>
                      <td className="py-2 text-right">
                        {builtIn && row.overridden ? (
                          <Button aria-label={t('Use the built-in price for {{key}}', { key: label })} onClick={() => patch(row.id, { overridden: false, price: String(row.builtIn) })} size="icon-sm" variant="quiet">
                            <RotateCcwIcon aria-hidden="true" />
                          </Button>
                        ) : null}
                        {builtIn ? null : (
                          <Button aria-label={t('Remove {{key}}', { key: label })} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} size="icon-sm" variant="quiet">
                            <XIcon aria-hidden="true" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="mt-3">
              <Button
                onClick={() => {
                  setRows((current) => [...current, { id: nextId, model: '', overridden: true, price: '', tool: '' }])
                  setNextId((id) => id + 1)
                  setSearch('')
                }}
                size="sm"
                variant="outline"
              >
                <PlusIcon aria-hidden="true" />
                {t('Add a tool price')}
              </Button>
            </div>
          </div>
        )}

        {showProblems && view === 'table' && written.issues.length > 0 ? (
          <p className="text-xs text-destructive" role="alert">{t('Fix the highlighted prices before saving.')}</p>
        ) : null}
        {error ? <Alert tone="destructive">{error}</Alert> : null}
      </Panel.Body>
      <Panel.Footer align="end">
        <Button aria-busy={saving} disabled={saving || unchanged} onClick={() => void save()} variant="primary">
          {saving ? t('Saving…') : t('Save tool prices')}
        </Button>
      </Panel.Footer>
    </Panel>
  )
}
