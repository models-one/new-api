import GlobeIcon from 'lucide-react/dist/esm/icons/globe'

import { SystemInfoSection } from '@/features/system-settings/sections/site/SystemInfoSection'
import {
  HeaderNavigationSection,
  NoticeSection,
  SidebarModulesSection,
} from '@/features/system-settings/site-content'
import type { SettingsGroupDefinition } from '@/features/system-settings/groups/types'

/**
 * OWNER: the agent rebuilding the Site group.
 *
 * Section ids mirror `web/src/features/system-settings/site/section-registry.tsx`.
 *
 * `header-navigation` and `sidebar-modules` are worth a warning: their keys —
 * `HeaderNavModules` and `SidebarModulesAdmin` — are never seeded. `model.InitOptionMap`
 * does not write them, so `GET /api/option/` omits them entirely on a fresh deployment
 * and returns them only after somebody has saved one; `middleware/header_nav.go` and
 * `controller/misc.go` simply read whatever is in the map. Read them with an explicit
 * fallback and treat "absent" and "empty" alike as "never configured", not as an error.
 */
export const siteGroup: SettingsGroupDefinition = {
  Icon: GlobeIcon,
  description: 'Identity, legal copy and navigation for the public site and the console.',
  id: 'site',
  sections: [
    {
      Component: SystemInfoSection,
      description: 'The name, logo and copy this deployment presents to its users.',
      id: 'system-info',
      title: 'System information',
    },
    {
      Component: NoticeSection,
      description: 'The banner shown to every signed-in user.',
      id: 'notice',
      title: 'System notice',
    },
    {
      Component: HeaderNavigationSection,
      description: 'Which modules appear in the top navigation.',
      id: 'header-navigation',
      title: 'Header navigation',
    },
    {
      Component: SidebarModulesSection,
      description: 'Which modules appear in the console sidebar.',
      id: 'sidebar-modules',
      title: 'Sidebar modules',
    },
  ],
  title: 'Site',
}
