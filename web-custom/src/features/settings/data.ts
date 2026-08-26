import type { ApiKeyRecord, ModelGroup, Provider } from '@/features/settings/types'

export const providers: Provider[] = [
  { id: 'openai', name: 'OpenAI', tone: 'primary' },
  { id: 'anthropic', name: 'Claude', tone: 'warning' },
  { id: 'google', name: 'Gemini', tone: 'info' },
  { id: 'deepseek', name: 'DeepSeek', tone: 'secondary' },
  { id: 'qwen', name: 'Qwen', tone: 'success' },
  { id: 'xai', name: 'Grok', tone: 'muted' },
]

export const modelGroups: ModelGroup[] = [
  { id: 'gpt-priority', name: 'gpt-priority', providerId: 'openai', ratio: 1, tone: 'primary' },
  { id: 'gpt-lowcost', name: 'gpt-lowcost', providerId: 'openai', ratio: 0.5, tone: 'success' },
  { id: 'gpt-image', name: 'gpt-image', providerId: 'openai', ratio: 1.8, tone: 'info' },
  { id: 'claude-priority', name: 'claude-priority', providerId: 'anthropic', ratio: 1.4, tone: 'warning' },
  { id: 'claude-standard', name: 'claude-standard', providerId: 'anthropic', ratio: 0.9, tone: 'secondary' },
  { id: 'gemini-standard', name: 'gemini-standard', providerId: 'google', ratio: 0.7, tone: 'info' },
  { id: 'deepseek-economy', name: 'deepseek-economy', providerId: 'deepseek', ratio: 0.35, tone: 'secondary' },
  { id: 'qwen-cn', name: 'qwen-cn', providerId: 'qwen', ratio: 0.25, tone: 'success' },
  { id: 'grok-realtime', name: 'grok-realtime', providerId: 'xai', ratio: 1.2, tone: 'warning' },
]

export const modelGroupById = new Map(modelGroups.map((group) => [group.id, group]))

export const initialApiKeys: ApiKeyRecord[] = [
  {
    id: 'production-router',
    name: 'Production Router',
    secret: 'sk-prod-a93k8f2m',
    active: true,
    spent: 142.5,
    unlimitedQuota: true,
    created: 'Aug 04, 2026',
    expires: 'Never',
    groupIds: ['gpt-priority', 'gpt-image', 'claude-priority', 'gemini-standard'],
  },
  {
    id: 'cost-optimized',
    name: 'Cost Optimized',
    secret: 'sk-save-h51d9p4q',
    active: true,
    spent: 48.2,
    unlimitedQuota: true,
    created: 'Aug 02, 2026',
    expires: 'Never',
    groupIds: ['gpt-lowcost', 'claude-standard', 'deepseek-economy', 'qwen-cn'],
  },
  {
    id: 'sandbox',
    name: 'Developer Sandbox',
    secret: 'sk-dev-c18n7v3x',
    active: false,
    spent: 6.8,
    unlimitedQuota: false,
    created: 'Jul 28, 2026',
    expires: 'Sep 30, 2026',
    groupIds: ['gpt-lowcost', 'gemini-standard'],
  },
]
