import NetworkIcon from 'lucide-react/dist/esm/icons/network'

import {
  ChannelAffinitySection,
  ClaudeSection,
  GeminiSection,
  GlobalModelsSection,
  GrokSection,
  ModelDeploymentSection,
  PriceSyncSection,
  RoutingReliabilitySection,
} from '@/features/system-settings/models-operations'
import type { SettingsGroupDefinition } from '@/features/system-settings/groups/types'

/**
 * OWNER: the agent rebuilding the Models group.
 *
 * Section ids mirror `web/src/features/system-settings/models/section-registry.tsx`.
 *
 * Two live findings for whoever takes this on.
 *   - The `model-deployment` section has NO keys in the payload. `model_deployment.ionet.api_key`
 *     is stripped as a secret and `model_deployment.ionet.enabled` is simply not there on
 *     the seeded server. Verify before building a control for either.
 *   - `GroupRatio`, `gemini.safety_settings`, `claude.default_max_tokens`, `ImageRatio`,
 *     `AudioRatio`, `AudioCompletionRatio` and `CreateCacheRatio` are validated server-side
 *     and refused with a real message when the JSON is wrong. That refusal arrives as
 *     HTTP 200 with `success:false`; the section form already renders it per key.
 */
export const modelsGroup: SettingsGroupDefinition = {
  Icon: NetworkIcon,
  description: 'Per-vendor behaviour, routing reliability and price synchronisation.',
  id: 'models',
  sections: [
    {
      Component: GlobalModelsSection,
      description: 'Pass-through requests, thinking blacklist and keep-alive pings.',
      id: 'global',
      title: 'Global model configuration',
    },
    {
      Component: RoutingReliabilitySection,
      description: 'Retries, automatic channel disabling and channel testing.',
      id: 'routing-reliability',
      title: 'Routing reliability',
    },
    {
      Component: PriceSyncSection,
      description: 'The upstream price feed and how much of it is applied.',
      id: 'price-sync',
      title: 'Model price sync',
    },
    {
      Component: GeminiSection,
      description: 'Safety settings, API versions and the thinking adapter.',
      id: 'gemini',
      title: 'Gemini',
    },
    {
      Component: ClaudeSection,
      description: 'Default max tokens, per-model headers and the thinking adapter.',
      id: 'claude',
      title: 'Claude',
    },
    {
      Component: GrokSection,
      description: 'The deduction applied to a violation response.',
      id: 'grok',
      title: 'Grok',
    },
    {
      Component: ChannelAffinitySection,
      description: 'Sticky routing of a conversation to the channel that served it.',
      id: 'channel-affinity',
      title: 'Channel affinity',
    },
    {
      Component: ModelDeploymentSection,
      description: 'Managed deployment providers.',
      id: 'model-deployment',
      title: 'Model deployment',
    },
  ],
  title: 'Models',
}
