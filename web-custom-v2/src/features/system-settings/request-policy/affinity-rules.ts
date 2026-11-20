/**
 * `channel_affinity_setting.rules` (`operation_setting.ChannelAffinityRule`): which requests
 * stick to the channel that served them, keyed by a value read from the request.
 *
 * A rule is edited through the fields below; any other field it carries (a parameter
 * override template, or one a newer server adds) is kept exactly as stored.
 */

export type KeySourceType = 'request_header' | 'gjson' | 'context_string' | 'context_int'

export type KeySource = { type: KeySourceType | string; key: string; path: string }

/**
 * How a matched request uses its remembered channel (`service.EffectiveSessionMode`):
 *   off      matches, but never remembers or reuses a channel
 *   prefer   reuses the remembered channel while it is usable; otherwise picks another and
 *            retries normally
 *   strict   only the remembered channel; if it is unusable the request fails with 503,
 *            and a failure is not retried elsewhere
 *   inherit  the global session mode
 *   ''       stored by older versions: strict when skip_retry_on_failure is set, else prefer
 */
export type RuleSessionMode = 'inherit' | 'off' | 'prefer' | 'strict' | ''

export type AffinityRule = {
  name: string
  modelRegex: string[]
  pathRegex: string[]
  userAgentInclude: string[]
  keySources: KeySource[]
  valueRegex: string
  ttlSeconds: number
  sessionMode: RuleSessionMode
  skipRetryOnFailure: boolean
  includeUsingGroup: boolean
  includeModelName: boolean
  includeRuleName: boolean
  /** Every stored field this editor does not show, written back unchanged. */
  rest: Record<string, unknown>
}

const KNOWN = new Set([
  'name',
  'model_regex',
  'path_regex',
  'user_agent_include',
  'key_sources',
  'value_regex',
  'ttl_seconds',
  'session_mode',
  'skip_retry_on_failure',
  'include_using_group',
  'include_model_name',
  'include_rule_name',
])

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])

/** The rules, or null when the stored text is not a JSON array of objects. */
export function readAffinityRules(text: string): AffinityRule[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.trim() === '' ? '[]' : text)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const rules: AffinityRule[] = []
  for (const item of parsed) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return null
    const record = item as Record<string, unknown>
    const rest: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) if (!KNOWN.has(key)) rest[key] = value
    const mode = record.session_mode
    rules.push({
      includeModelName: record.include_model_name === true,
      includeRuleName: record.include_rule_name === true,
      includeUsingGroup: record.include_using_group === true,
      keySources: Array.isArray(record.key_sources)
        ? record.key_sources
            .filter((source): source is Record<string, unknown> => source !== null && typeof source === 'object')
            .map((source) => ({
              key: typeof source.key === 'string' ? source.key : '',
              path: typeof source.path === 'string' ? source.path : '',
              type: typeof source.type === 'string' ? source.type : 'request_header',
            }))
        : [],
      modelRegex: strings(record.model_regex),
      name: typeof record.name === 'string' ? record.name : '',
      pathRegex: strings(record.path_regex),
      rest,
      sessionMode: mode === 'inherit' || mode === 'off' || mode === 'prefer' || mode === 'strict' ? mode : '',
      skipRetryOnFailure: record.skip_retry_on_failure === true,
      ttlSeconds: typeof record.ttl_seconds === 'number' ? record.ttl_seconds : 0,
      userAgentInclude: strings(record.user_agent_include),
      valueRegex: typeof record.value_regex === 'string' ? record.value_regex : '',
    })
  }
  return rules
}

/** The rules as stored, field order following the server's struct. */
export function writeAffinityRules(rules: readonly AffinityRule[]): string {
  return JSON.stringify(
    rules.map((rule) => ({
      name: rule.name.trim(),
      model_regex: rule.modelRegex,
      path_regex: rule.pathRegex,
      ...(rule.userAgentInclude.length > 0 ? { user_agent_include: rule.userAgentInclude } : {}),
      key_sources: rule.keySources.map((source) =>
        source.type === 'gjson' ? { path: source.path.trim(), type: source.type } : { key: source.key.trim(), type: source.type },
      ),
      value_regex: rule.valueRegex,
      ttl_seconds: rule.ttlSeconds,
      ...rule.rest,
      skip_retry_on_failure: rule.skipRetryOnFailure,
      ...(rule.sessionMode === '' ? {} : { session_mode: rule.sessionMode }),
      include_using_group: rule.includeUsingGroup,
      include_model_name: rule.includeModelName,
      include_rule_name: rule.includeRuleName,
    })),
  )
}

/** The mode a rule runs in, as the server resolves it. */
export function effectiveSessionMode(rule: Pick<AffinityRule, 'sessionMode' | 'skipRetryOnFailure'>, globalMode: string): 'off' | 'prefer' | 'strict' {
  const pick = (mode: string) => (mode === 'off' || mode === 'strict' ? mode : 'prefer')
  if (rule.sessionMode === 'inherit') return pick(globalMode)
  if (rule.sessionMode !== '') return pick(rule.sessionMode)
  return rule.skipRetryOnFailure ? 'strict' : 'prefer'
}

export function newAffinityRule(): AffinityRule {
  return {
    includeModelName: false,
    includeRuleName: true,
    includeUsingGroup: true,
    keySources: [{ key: '', path: '', type: 'request_header' }],
    modelRegex: [],
    name: '',
    pathRegex: [],
    rest: {},
    sessionMode: 'inherit',
    skipRetryOnFailure: false,
    ttlSeconds: 0,
    userAgentInclude: [],
    valueRegex: '',
  }
}

export type RuleProblem = { field: 'name' | 'keySources' | 'ttlSeconds' | 'regex'; message: string; pattern?: string }

/**
 * What the editor can check before the server does. The server compiles the regexes with
 * its own engine and refuses the whole policy on a bad one; JavaScript's engine is close
 * enough to catch the usual typo early.
 */
export function findRuleProblems(rule: AffinityRule, others: readonly AffinityRule[]): RuleProblem[] {
  const problems: RuleProblem[] = []
  const name = rule.name.trim()
  if (name === '') problems.push({ field: 'name', message: 'Every rule needs a name.' })
  else if (others.some((other) => other.name.trim() === name)) {
    problems.push({ field: 'name', message: 'Another rule already has this name. Cache entries are kept per rule name, so names must be unique.' })
  }
  if (rule.keySources.length === 0 || rule.keySources.some((source) => (source.type === 'gjson' ? source.path : source.key).trim() === '')) {
    problems.push({ field: 'keySources', message: 'Add at least one key source, each with its header, path or key.' })
  }
  if (!Number.isInteger(rule.ttlSeconds) || rule.ttlSeconds < 0) problems.push({ field: 'ttlSeconds', message: 'Enter zero or more whole seconds.' })
  for (const pattern of [...rule.modelRegex, ...rule.pathRegex, ...(rule.valueRegex === '' ? [] : [rule.valueRegex])]) {
    try {
      new RegExp(pattern)
    } catch {
      problems.push({ field: 'regex', message: 'Not a valid regular expression: {{pattern}}', pattern })
      break
    }
  }
  return problems
}
