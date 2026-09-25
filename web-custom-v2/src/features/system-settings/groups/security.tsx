import LockIcon from 'lucide-react/dist/esm/icons/lock'

import { RateLimitSection } from '@/features/system-settings/auth-security/sections/RateLimitSection'
import { SensitiveWordsSection } from '@/features/system-settings/auth-security/sections/SensitiveWordsSection'
import { SsrfSection } from '@/features/system-settings/auth-security/sections/SsrfSection'
import { TokenLimitsSection } from '@/features/system-settings/auth-security/sections/TokenLimitsSection'
import type { SettingsGroupDefinition } from '@/features/system-settings/groups/types'

/**
 * OWNER: the agent rebuilding the Security group.
 *
 * Section ids mirror `web/src/features/system-settings/security/section-registry.tsx`.
 *
 * The SSRF keys are the ones to be careful with: `fetch_setting.domain_list`,
 * `fetch_setting.ip_list` and `fetch_setting.allowed_ports` arrive as serialised JSON
 * ARRAYS, and `allowed_ports` holds STRINGS on the seeded server —
 * `["80","443","8080","8443"]`, not numbers. Read them with
 * `readOptionStringList(options, key, 'json')` and coerce deliberately.
 */
export const securityGroup: SettingsGroupDefinition = {
  Icon: LockIcon,
  description: 'Request rate limits, prompt filtering, outbound fetch policy and key limits.',
  id: 'security',
  sections: [
    {
      description: 'How many model requests an account may make in a window.',
      Component: RateLimitSection,
      id: 'rate-limit',
      title: 'Rate limiting',
    },
    {
      description: 'The words a prompt is refused for.',
      Component: SensitiveWordsSection,
      id: 'sensitive-words',
      title: 'Sensitive words',
    },
    {
      description: 'Which hosts and ports the gateway may fetch from.',
      Component: SsrfSection,
      id: 'ssrf',
      title: 'SSRF protection',
    },
    {
      description: 'How many API keys a single account may hold.',
      Component: TokenLimitsSection,
      id: 'token-limits',
      title: 'Token limits',
    },
  ],
  title: 'Security',
}
