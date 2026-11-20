import WaypointsIcon from 'lucide-react/dist/esm/icons/waypoints'

import type { SettingsGroupDefinition } from '@/features/system-settings/groups/types'
import { ChannelHealthSection } from '@/features/system-settings/request-policy/ChannelHealthSection'
import { SessionsRetriesSection } from '@/features/system-settings/request-policy/SessionsRetriesSection'

/**
 * How requests are routed when channels fail: session affinity, retries and channel
 * health. Ids match `web/src/features/system-settings/request-policies/section-registry.tsx`
 * (`/system-settings/request-policies/routing`, `…/health`). Both sections read and save
 * the policy through `/api/option/request_policy`, which validates it as a whole.
 */
export const requestPoliciesGroup: SettingsGroupDefinition = {
  Icon: WaypointsIcon,
  description: 'Session affinity, retries and channel health.',
  id: 'request-policies',
  sections: [
    {
      Component: SessionsRetriesSection,
      description: 'Sticky sessions, their rules and how failed requests are retried.',
      id: 'routing',
      title: 'Sessions and retries',
    },
    {
      Component: ChannelHealthSection,
      description: 'Automatic disabling, scheduled channel tests and recovery.',
      id: 'health',
      title: 'Channel health',
    },
  ],
  title: 'Request policy',
}
