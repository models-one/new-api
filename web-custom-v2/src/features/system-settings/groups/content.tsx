import FileTextIcon from 'lucide-react/dist/esm/icons/file-text'

import {
  AnnouncementsSection,
  ApiInfoSection,
  ChatPresetsSection,
  DashboardSection,
  DrawingSection,
  FaqSection,
  UptimeKumaSection,
} from '@/features/system-settings/site-content'
import type { SettingsGroupDefinition } from '@/features/system-settings/groups/types'

/**
 * OWNER: the agent rebuilding the Content group.
 *
 * Section ids mirror `web/src/features/system-settings/content/section-registry.tsx`.
 *
 * Every one of `console_setting.announcements`, `console_setting.api_info`,
 * `console_setting.faq`, `console_setting.uptime_kuma_groups` and `Chats` is a serialised
 * JSON blob, and four of the five are EMPTY STRINGS on a fresh deployment. Read them with
 * `readOptionJson` and a real fallback: an empty string is not valid JSON, and a throw
 * here would take the whole settings area down.
 */
export const contentGroup: SettingsGroupDefinition = {
  Icon: FileTextIcon,
  description: 'The copy, panels and presets the console shows its users.',
  id: 'content',
  sections: [
    {
      Component: DashboardSection,
      description: 'What the usage dashboard aggregates and how often.',
      id: 'dashboard',
      title: 'Data dashboard',
    },
    {
      Component: AnnouncementsSection,
      description: 'The announcement list on the console home.',
      id: 'announcements',
      title: 'Announcements',
    },
    {
      Component: ApiInfoSection,
      description: 'The published base URLs users copy into their clients.',
      id: 'api-info',
      title: 'API addresses',
    },
    {
      Component: FaqSection,
      description: 'The questions and answers shown in the console.',
      id: 'faq',
      title: 'FAQ',
    },
    {
      Component: UptimeKumaSection,
      description: 'The uptime monitor embedded on the status panel.',
      id: 'uptime-kuma',
      title: 'Uptime Kuma',
    },
    {
      Component: ChatPresetsSection,
      description: 'The third-party chat clients offered as one-click links.',
      id: 'chat',
      title: 'Chat presets',
    },
    {
      Component: DrawingSection,
      description: 'Image generation and its Midjourney options.',
      id: 'drawing',
      title: 'Drawing',
    },
  ],
  title: 'Content',
}
