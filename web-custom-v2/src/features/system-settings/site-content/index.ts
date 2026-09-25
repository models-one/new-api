/**
 * The Site and Content settings groups.
 *
 * Only the eleven section components are exported: they are registered by name in
 * `groups/site.tsx` and `groups/content.tsx` and rendered by the settings shell, and
 * nothing outside this directory needs the list editor, the navigation parsers or the
 * validation helpers. `SystemInfoSection` belongs to the Site group too but was built with
 * the foundation and lives under `sections/site/`.
 */
export { AnnouncementsSection } from '@/features/system-settings/site-content/sections/AnnouncementsSection'
export { ApiInfoSection } from '@/features/system-settings/site-content/sections/ApiInfoSection'
export { ChatPresetsSection } from '@/features/system-settings/site-content/sections/ChatPresetsSection'
export { DashboardSection } from '@/features/system-settings/site-content/sections/DashboardSection'
export { DrawingSection } from '@/features/system-settings/site-content/sections/DrawingSection'
export { FaqSection } from '@/features/system-settings/site-content/sections/FaqSection'
export { HeaderNavigationSection } from '@/features/system-settings/site-content/sections/HeaderNavigationSection'
export { NoticeSection } from '@/features/system-settings/site-content/sections/NoticeSection'
export { SidebarModulesSection } from '@/features/system-settings/site-content/sections/SidebarModulesSection'
export { UptimeKumaSection } from '@/features/system-settings/site-content/sections/UptimeKumaSection'
