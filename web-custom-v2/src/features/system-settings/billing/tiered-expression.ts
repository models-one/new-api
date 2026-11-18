import {
  buildRequestRuleExpr,
  combineBillingExpr,
  splitBillingExprAndRequestRules,
  tryParseRequestRuleExpr,
  type RequestCondition,
  type RequestRuleGroup,
} from '@/lib/billing-expression/billing-expr'
import {
  createEmptyVisualCondition,
  parseVisualBillingDocument,
  serializeVisualBillingDocument,
  visualNodeId,
  type VisualBillingDocument,
  type VisualBillingIssue,
  type VisualCondition,
  type VisualPricingNode,
} from '@/lib/billing-expression/visual'

/**
 * The tiered (visual) view of a billing expression (`pkg/billingexpr/expr.md`).
 *
 * An expression is split into its base price — a tree of conditions over token counts and
 * time with a tier at every leaf — and the request rules multiplied onto it. Both halves
 * come from `@/lib/billing-expression`, which patches only the edited source spans, so an
 * expression opened and saved untouched is stored byte for byte as it was.
 *
 * Anything the visual model cannot carry without loss (min/max, request parameters inside
 * the price, repeated variables…) is not offered here and stays editable as text.
 */

export type TieredDraft = {
  document: VisualBillingDocument
  rules: RequestRuleGroup[]
  /** The request rules as written; stored as is until a rule is edited. */
  rulesSource: string
  /** False when the rules exist but cannot be shown as rows; they are then kept as text. */
  rulesEditable: boolean
  rulesEdited: boolean
}

export type TieredIssue = VisualBillingIssue

export function readTieredDraft(expression: string): TieredDraft | null {
  const { billingExpr, requestRuleExpr } = splitBillingExprAndRequestRules(expression)
  const document = parseVisualBillingDocument(billingExpr)
  if (document === null) return null
  const rules = tryParseRequestRuleExpr(requestRuleExpr)
  return {
    document,
    rules: rules ?? [],
    rulesEdited: false,
    rulesEditable: rules !== null,
    rulesSource: requestRuleExpr,
  }
}

/** A tier price nobody has typed yet: both token prices empty, so a save is refused until set. */
export function blankTieredDraft(): TieredDraft {
  const draft = readTieredDraft('tier("base", p * 0 + c * 0)')
  if (draft === null) throw new Error('the blank tier must parse')
  const root = draft.document.root
  if (root.kind === 'tier') {
    draft.document = { ...draft.document, root: { ...root, prices: root.prices.map((price) => ({ ...price, value: '' })) } }
  }
  return draft
}

/** The expression to store, or every problem that stops one from being written. */
export function writeTieredDraft(draft: TieredDraft): { expression: string; issues: [] } | { expression?: undefined; issues: TieredIssue[] } {
  const base = serializeVisualBillingDocument(draft.document)
  const issues: TieredIssue[] = base.ok ? [] : [...base.issues]
  let rules = draft.rulesSource
  if (draft.rulesEdited) {
    issues.push(...findRuleIssues(draft.rules))
    rules = buildRequestRuleExpr(draft.rules)
  }
  if (!base.ok || issues.length > 0) return { issues }
  return { expression: combineBillingExpr(base.source, rules), issues: [] }
}

// ---------------------------------------------------------------------------
// The pricing tree
// ---------------------------------------------------------------------------

export type TierNode = Extract<VisualPricingNode, { kind: 'tier' }>
export type BranchNode = Extract<VisualPricingNode, { kind: 'branch' }>

/**
 * `a ? A : b ? B : C` as the ordered rules an operator reads: the first matching
 * condition wins, and the last entry has no condition — it applies when none matched.
 */
export function ruleChain(node: VisualPricingNode): Array<{ branch: BranchNode | null; result: VisualPricingNode }> {
  const chain: Array<{ branch: BranchNode | null; result: VisualPricingNode }> = []
  let current = node
  while (current.kind === 'branch') {
    chain.push({ branch: current, result: current.yes })
    current = current.no
  }
  chain.push({ branch: null, result: current })
  return chain
}

/** Rebuilds a chain from rules, the reverse of `ruleChain`. */
export function fromRuleChain(chain: ReturnType<typeof ruleChain>): VisualPricingNode {
  let node = chain[chain.length - 1].result
  for (let index = chain.length - 2; index >= 0; index -= 1) {
    const { branch, result } = chain[index]
    if (branch === null) continue
    node = { ...branch, no: node, yes: result }
  }
  return node
}

/**
 * Adds a rule before the default price: a branch with an empty condition whose price is a
 * copy of the default, so the copy can be changed and the default keeps its source.
 */
export function addRule(root: VisualPricingNode): VisualPricingNode {
  const chain = ruleChain(root)
  const fallback = chain[chain.length - 1].result
  const copy = copyPricing(fallback)
  const branch: BranchNode = {
    condition: createEmptyVisualCondition(),
    id: visualNodeId(),
    kind: 'branch',
    no: fallback,
    yes: copy,
  }
  return fromRuleChain([...chain.slice(0, -1), { branch, result: copy }, chain[chain.length - 1]])
}

/** Removes one conditional rule; the rules after it move up. */
export function removeRule(root: VisualPricingNode, branchId: string): VisualPricingNode {
  return fromRuleChain(ruleChain(root).filter((entry) => entry.branch?.id !== branchId))
}

export function moveRule(root: VisualPricingNode, branchId: string, offset: -1 | 1): VisualPricingNode {
  const chain = ruleChain(root)
  const index = chain.findIndex((entry) => entry.branch?.id === branchId)
  const target = index + offset
  // The default price stays last; only conditional rules are reordered.
  if (index < 0 || target < 0 || target >= chain.length - 1) return root
  const next = [...chain]
  ;[next[index], next[target]] = [next[target], next[index]]
  return fromRuleChain(next)
}

/** A copy written as new source: no origin, fresh ids. */
function copyPricing(node: VisualPricingNode): VisualPricingNode {
  if (node.kind === 'tier') {
    return { ...node, id: visualNodeId(), origin: undefined, prices: node.prices.map(({ value, variable }) => ({ value, variable })) }
  }
  return { ...node, condition: copyCondition(node.condition), id: visualNodeId(), no: copyPricing(node.no), origin: undefined, yes: copyPricing(node.yes) }
}

function copyCondition(node: VisualCondition): VisualCondition {
  if (node.kind === 'comparison') return { ...node, id: visualNodeId(), origin: undefined }
  if (node.kind === 'not') return { ...node, child: copyCondition(node.child), id: visualNodeId(), origin: undefined }
  return { ...node, children: node.children.map(copyCondition), id: visualNodeId(), origin: undefined }
}

/** Every node id inside a pricing subtree, to attach serialization issues to the rule that owns them. */
export function pricingIds(node: VisualPricingNode, into = new Set<string>()): Set<string> {
  into.add(node.id)
  if (node.kind === 'branch') {
    conditionIds(node.condition, into)
    pricingIds(node.yes, into)
    pricingIds(node.no, into)
  }
  return into
}

export function conditionIds(node: VisualCondition, into = new Set<string>()): Set<string> {
  into.add(node.id)
  if (node.kind === 'not') conditionIds(node.child, into)
  if (node.kind === 'all' || node.kind === 'any') for (const child of node.children) conditionIds(child, into)
  return into
}

/** The issues of one node: `id` itself and `id:field`. */
export function issuesOf(issues: readonly TieredIssue[], id: string): TieredIssue[] {
  return issues.filter((issue) => issue.id === id || issue.id.startsWith(`${id}:`))
}

// ---------------------------------------------------------------------------
// Request rules
// ---------------------------------------------------------------------------

/**
 * Problems in the rule rows. `buildRequestRuleExpr` drops an incomplete row without a
 * word, which would silently stop charging a multiplier the operator believes is set,
 * so an incomplete row blocks the save instead.
 */
export function findRuleIssues(groups: readonly RequestRuleGroup[]): TieredIssue[] {
  const issues: TieredIssue[] = []
  groups.forEach((group, index) => {
    const multiplier = group.multiplier.trim()
    const value = Number(multiplier)
    if (multiplier === '' || !Number.isFinite(value) || value < 0) {
      issues.push({ id: `rule-${index}:multiplier`, message: 'Enter a finite, non-negative multiplier.' })
    }
    if (group.conditions.length === 0) {
      issues.push({ id: `rule-${index}`, message: 'Add at least one condition to this rule.' })
    }
    group.conditions.forEach((condition, position) => {
      if (!conditionComplete(condition)) {
        issues.push({ id: `rule-${index}:${position}`, message: 'Complete this condition.' })
      }
    })
  })
  return issues
}

function conditionComplete(condition: RequestCondition): boolean {
  if (condition.source === 'time' && !isTimeZone(condition.timezone)) return false
  return buildRequestRuleExpr([{ conditions: [condition], multiplier: '1' }]) !== ''
}

/** The server falls back to UTC on an unknown zone, which would apply the rule at the wrong hours. */
export function isTimeZone(value: string): boolean {
  if (value.trim() === '') return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.trim() })
    return true
  } catch {
    return false
  }
}
