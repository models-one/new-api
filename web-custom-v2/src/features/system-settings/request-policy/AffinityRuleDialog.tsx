import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import XIcon from 'lucide-react/dist/esm/icons/x'

import { Input, NativeSelect, NumberInput, RadioGroup, SwitchRow, Textarea } from '@/components/form'
import { Dialog } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'
import {
  findRuleProblems,
  type AffinityRule,
  type KeySource,
  type RuleProblem,
  type RuleSessionMode,
} from '@/features/system-settings/request-policy/affinity-rules'

type AffinityRuleDialogProps = {
  /** The rule being edited, or a new one. */
  rule: AffinityRule
  isNew: boolean
  /** The other rules, for the unique-name check. */
  others: readonly AffinityRule[]
  globalMode: string
  onCancel: () => void
  onDone: (rule: AffinityRule) => void
}

const KEY_PLACEHOLDERS: Record<string, string> = { gjson: 'metadata.user_id', request_header: 'session_id' }

const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter((line) => line !== '')

/** Edits one affinity rule. Nothing is saved until the section is saved. */
export function AffinityRuleDialog(props: AffinityRuleDialogProps) {
  const { t } = useTranslation()
  const [rule, setRule] = useState(props.rule)
  const [models, setModels] = useState(props.rule.modelRegex.join('\n'))
  const [paths, setPaths] = useState(props.rule.pathRegex.join('\n'))
  const [agents, setAgents] = useState(props.rule.userAgentInclude.join('\n'))
  const [ttl, setTtl] = useState(String(props.rule.ttlSeconds))
  const [showProblems, setShowProblems] = useState(false)

  const draft: AffinityRule = { ...rule, modelRegex: lines(models), pathRegex: lines(paths), ttlSeconds: ttl.trim() === '' ? 0 : Number(ttl), userAgentInclude: lines(agents) }
  const problems = findRuleProblems(draft, props.others)
  const problemOf = (field: RuleProblem['field']) => {
    if (!showProblems) return undefined
    const problem = problems.find((item) => item.field === field)
    return problem === undefined ? undefined : t(problem.message, { pattern: problem.pattern })
  }
  const setSource = (index: number, next: Partial<KeySource>) =>
    setRule({ ...rule, keySources: rule.keySources.map((source, at) => (at === index ? { ...source, ...next } : source)) })

  const modeOptions: Array<{ value: RuleSessionMode; label: string; description: string }> = [
    { description: t('Uses the global session mode ({{mode}}).', { mode: t(globalModeLabel(props.globalMode)) }), label: t('Same as global'), value: 'inherit' },
    { description: t('Matches, but never remembers or reuses a channel.'), label: t('Off'), value: 'off' },
    { description: t('Reuses the remembered channel while it is usable; otherwise another channel serves and retries work as usual.'), label: t('Prefer'), value: 'prefer' },
    { description: t('Only the remembered channel. If it cannot serve, the request fails with 503 and is not retried elsewhere.'), label: t('Strict'), value: 'strict' },
  ]
  if (props.rule.sessionMode === '') {
    modeOptions.push({
      description: t('As stored by an older version: strict when “do not retry on failure” is set, otherwise prefer.'),
      label: t('Legacy'),
      value: '',
    })
  }
  const restKeys = Object.keys(rule.rest)

  return (
    <Dialog
      footer={
        <>
          <Button onClick={props.onCancel} variant="outline">
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => {
              setShowProblems(true)
              if (problems.length === 0) props.onDone(draft)
            }}
            variant="primary"
          >
            {props.isNew ? t('Add rule') : t('Apply')}
          </Button>
        </>
      }
      onOpenChange={(open) => (open ? undefined : props.onCancel())}
      open
      scrollBody
      size="lg"
      title={props.isNew ? t('New affinity rule') : t('Edit {{rule}}', { rule: props.rule.name })}
    >
      <div className="flex flex-col gap-5">
        <Input error={problemOf('name')} inputClassName="mono" label={t('Rule name')} onChange={(event) => setRule({ ...rule, name: event.target.value })} required value={rule.name} />

        <div className="grid gap-4 md:grid-cols-2">
          <Textarea
            description={t('One regular expression per line. Empty matches every model.')}
            label={t('Models')}
            onChange={(event) => setModels(event.target.value)}
            rows={3}
            spellCheck={false}
            textareaClassName="mono text-xs"
            value={models}
          />
          <Textarea
            description={t('One regular expression per line, matched against the request path. Empty matches every path.')}
            label={t('Request paths')}
            onChange={(event) => setPaths(event.target.value)}
            rows={3}
            spellCheck={false}
            textareaClassName="mono text-xs"
            value={paths}
          />
          <Textarea
            description={t('Optional. The rule applies only when the User-Agent contains one of these, one per line.')}
            label={t('User-Agent contains')}
            onChange={(event) => setAgents(event.target.value)}
            rows={2}
            spellCheck={false}
            textareaClassName="mono text-xs"
            value={agents}
          />
          <Input
            description={t('Optional. Only key values matching this regular expression are remembered.')}
            inputClassName="mono"
            label={t('Key value pattern')}
            onChange={(event) => setRule({ ...rule, valueRegex: event.target.value })}
            value={rule.valueRegex}
          />
        </div>
        {problemOf('regex') ? <p className="text-xs text-destructive" role="alert">{problemOf('regex')}</p> : null}

        <section aria-label={t('Key sources')} className="flex flex-col gap-2">
          <div>
            <p className="text-sm font-medium text-foreground">{t('Key sources')}</p>
            <p className="text-xs leading-5 text-muted">{t('Where the session key is read from, tried in order; the first one present is used.')}</p>
          </div>
          {rule.keySources.map((source, index) => (
            <div className="flex flex-wrap items-start gap-2" key={index}>
              <NativeSelect
                className="w-48"
                hideLabel
                label={t('Kind of key source {{index}}', { index: index + 1 })}
                onChange={(event) => setSource(index, { type: event.target.value })}
                options={[
                  { label: t('Request header'), value: 'request_header' },
                  { label: t('Request body field'), value: 'gjson' },
                  { label: t('Request context (text)'), value: 'context_string' },
                  { label: t('Request context (number)'), value: 'context_int' },
                ]}
                size="sm"
                value={source.type}
              />
              <Input
                className="min-w-0 flex-1"
                hideLabel
                inputClassName="mono"
                label={t('Key of key source {{index}}', { index: index + 1 })}
                onChange={(event) => setSource(index, source.type === 'gjson' ? { path: event.target.value } : { key: event.target.value })}
                placeholder={KEY_PLACEHOLDERS[source.type] ?? 'id'}
                size="sm"
                value={source.type === 'gjson' ? source.path : source.key}
              />
              <Button aria-label={t('Remove key source {{index}}', { index: index + 1 })} onClick={() => setRule({ ...rule, keySources: rule.keySources.filter((_, at) => at !== index) })} size="icon-sm" variant="quiet">
                <XIcon aria-hidden="true" />
              </Button>
            </div>
          ))}
          {problemOf('keySources') ? <p className="text-xs text-destructive" role="alert">{problemOf('keySources')}</p> : null}
          <div>
            <Button onClick={() => setRule({ ...rule, keySources: [...rule.keySources, { key: '', path: '', type: 'request_header' }] })} size="sm" variant="outline">
              <PlusIcon aria-hidden="true" />
              {t('Add a key source')}
            </Button>
          </div>
        </section>

        <RadioGroup<RuleSessionMode>
          label={t('Session mode')}
          onValueChange={(sessionMode) => setRule({ ...rule, sessionMode })}
          options={modeOptions}
          value={rule.sessionMode}
          variant="card"
        />
        {rule.sessionMode === '' ? (
          <SwitchRow
            checked={rule.skipRetryOnFailure}
            description={t('Legacy setting: makes this rule strict.')}
            label={t('Do not retry on failure')}
            onCheckedChange={(checked) => setRule({ ...rule, skipRetryOnFailure: checked })}
          />
        ) : null}

        <NumberInput
          description={t('How long a remembered channel is kept. 0 uses the default lifetime.')}
          error={problemOf('ttlSeconds')}
          label={t('Lifetime (seconds)')}
          min={0}
          onChange={(event) => setTtl(event.target.value)}
          step={1}
          value={ttl}
        />

        <div className="flex flex-col">
          <SwitchRow checked={rule.includeUsingGroup} description={t('Users in different groups are remembered separately.')} label={t('Separate by group')} onCheckedChange={(checked) => setRule({ ...rule, includeUsingGroup: checked })} />
          <SwitchRow checked={rule.includeModelName} description={t('Different models are remembered separately.')} label={t('Separate by model')} onCheckedChange={(checked) => setRule({ ...rule, includeModelName: checked })} />
          <SwitchRow checked={rule.includeRuleName} description={t('Tags entries with this rule, so they are counted and can be cleared per rule.')} label={t('Track per rule')} onCheckedChange={(checked) => setRule({ ...rule, includeRuleName: checked })} />
        </div>

        {restKeys.length > 0 ? (
          <Alert tone="info">{t('This rule also has settings edited as JSON only, kept as they are: {{fields}}.', { fields: restKeys.join(', ') })}</Alert>
        ) : null}
      </div>
    </Dialog>
  )
}

export function globalModeLabel(mode: string): string {
  if (mode === 'off') return 'Off'
  if (mode === 'strict') return 'Strict'
  return 'Prefer'
}
