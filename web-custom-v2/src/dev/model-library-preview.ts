import { AxiosHeaders } from 'axios'
import { t } from 'i18next'

import type { PricingModel, PricingResponse } from '@/lib/api/pricing'
import type { ServerStatus } from '@/lib/api/status'
import type { SelfUser } from '@/lib/api/user'
import { api } from '@/lib/http-client'

// Illustrative fixtures for layout review only, not provider price quotations.
const models: PricingModel[] = [
  {
    model_name: 'claude-sonnet-4',
    vendor_id: 1,
    description:
      'Balanced reasoning, coding, and long-form writing for everyday production workloads.',
    tags: 'Reasoning,Vision,Tools',
    model_ratio: 1.5,
    completion_ratio: 5,
  },
  {
    model_name: 'claude-haiku-3.5',
    vendor_id: 1,
    description:
      'Fast responses for lightweight agents, classification, and interactive experiences.',
    tags: 'Tools,Vision',
    model_ratio: 0.4,
    completion_ratio: 5,
  },
  {
    model_name: 'deepseek-chat',
    vendor_id: 2,
    description: 'Efficient general-purpose language model for multilingual applications.',
    tags: 'Tools,Text',
    model_ratio: 0.14,
    completion_ratio: 1.5,
  },
  {
    model_name: 'deepseek-reasoner',
    vendor_id: 2,
    description: 'Step-by-step reasoning for mathematics, complex analysis, and code.',
    tags: 'Reasoning,Text',
    model_ratio: 0.275,
    completion_ratio: 4,
  },
  {
    model_name: 'gemini-2.5-flash',
    vendor_id: 3,
    description: 'Low-latency multimodal intelligence with a flexible performance profile.',
    tags: 'Vision,Tools,Reasoning',
    model_ratio: 0.15,
    completion_ratio: 8.3333,
  },
  {
    model_name: 'gemini-2.5-pro',
    vendor_id: 3,
    description: 'Advanced reasoning with dynamic pricing based on the request context.',
    tags: 'Reasoning,Vision',
    billing_mode: 'tiered_expr',
    model_ratio: 0.625,
    completion_ratio: 8,
  },
  {
    model_name: 'gpt-4.1',
    vendor_id: 4,
    description: 'Reliable instruction following and coding for complex agent workflows.',
    tags: 'Vision,Tools',
    model_ratio: 1,
    completion_ratio: 4,
  },
  {
    model_name: 'gpt-4.1-mini',
    vendor_id: 4,
    description: 'A compact, versatile model for high-volume applications.',
    tags: 'Vision,Tools',
    model_ratio: 0.2,
    completion_ratio: 4,
  },
  {
    model_name: 'gpt-image-1',
    vendor_id: 4,
    description: 'Generate images from text instructions for creative workflows.',
    tags: 'Image',
    quota_type: 1,
    model_price: 0.04,
    supported_endpoint_types: ['image-generation'],
  },
  {
    model_name: 'llama-3.3-70b',
    vendor_id: 5,
    description: 'Open-weight multilingual model for conversational and developer applications.',
    tags: 'Text,Tools',
    model_ratio: 0.295,
    completion_ratio: 1.34,
  },
  {
    model_name: 'mistral-large',
    vendor_id: 6,
    description: 'Multilingual understanding with structured outputs and tool use.',
    tags: 'Tools,Text',
    model_ratio: 1,
    completion_ratio: 3,
  },
  {
    model_name: 'text-embedding-3-small',
    vendor_id: 4,
    description: 'Compact embeddings for semantic search, retrieval, and clustering.',
    tags: 'Embeddings',
    model_ratio: 0.01,
    completion_ratio: 0,
    supported_endpoint_types: ['embeddings'],
    enable_groups: ['default'],
  },
].map((model) => ({
  quota_type: 0,
  model_ratio: 0,
  model_price: 0,
  completion_ratio: 0,
  owner_by: '',
  enable_groups: ['default', 'priority'],
  supported_endpoint_types: ['openai'],
  ...model,
}))

const catalogue: PricingResponse = {
  success: true,
  data: models,
  vendors: ['Anthropic', 'DeepSeek', 'Google', 'OpenAI', 'Meta', 'Mistral'].map((name, index) => ({
    id: index + 1,
    name,
  })),
  group_ratio: { default: 1, priority: 1.2 },
  usable_group: { default: 'Default', priority: 'Priority' },
  auto_groups: ['default', 'priority'],
  supported_endpoint: {
    openai: { method: 'POST', path: '/v1/chat/completions' },
    'image-generation': { method: 'POST', path: '/v1/images/generations' },
    embeddings: { method: 'POST', path: '/v1/embeddings' },
  },
}

const account: Partial<SelfUser> = {
  id: 0,
  username: 'preview',
  display_name: 'Preview workspace',
  role: 1,
  email: '',
  group: 'default',
  quota: 0,
  used_quota: 0,
  request_count: 0,
}
const status: Partial<ServerStatus> = {
  system_name: 'new-api',
  logo: '',
  docs_link: '',
  setup: true,
  quota_per_unit: 500000,
  display_in_currency: true,
  quota_display_type: 'USD',
}

export function installModelLibraryPreview() {
  api.defaults.adapter = async (config) => {
    let data: unknown
    if (config.method === 'get' && config.url === '/api/pricing') data = catalogue
    else if (config.method === 'get' && config.url === '/api/status')
      data = { success: true, data: status }
    else if (config.method === 'get' && config.url === '/api/user/self')
      data = { success: true, data: account }
    else
      data = {
        success: false,
        message: t(
          'This preview only includes the model library. Open live mode to use other pages.',
        ),
      }
    // Never forward requests (including writes) from the isolated design preview.
    return { data, config, headers: new AxiosHeaders(), status: 200, statusText: 'OK' }
  }
}
