import Building2Icon from 'lucide-react/dist/esm/icons/building-2'
import CreditCardIcon from 'lucide-react/dist/esm/icons/credit-card'
import EllipsisIcon from 'lucide-react/dist/esm/icons/ellipsis'
import MailIcon from 'lucide-react/dist/esm/icons/mail'
import SearchIcon from 'lucide-react/dist/esm/icons/search'
import UserPlusIcon from 'lucide-react/dist/esm/icons/user-plus'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'

const members = [
  { name: 'Elena Rostova', email: 'elena.r@example.com', initials: 'ER', roleKey: 'Admin', tone: 'primary' as const },
  { name: 'Marcus Chen', email: 'm.chen@example.com', initials: 'MC', roleKey: 'Developer', tone: 'secondary' as const },
  { name: 'Sarah Jenkins', email: 'sarah.j@example.com', initials: 'SJ', roleKey: 'Viewer', tone: 'muted' as const },
]

export function OrganizationPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const filteredMembers = useMemo(() => members.filter((member) => `${member.name} ${member.email}`.toLowerCase().includes(query.toLowerCase())), [query])

  return (
    <div className="flex flex-col gap-8">
      <PageHeader action={<Button><UserPlusIcon aria-hidden="true" />{t('Invite member')}</Button>} description={t('Manage workspace members, roles, and organization-wide settings.')} title={t('Team and organization')} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel className="overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-bold">{t('Workspace members')}</h2><label className="field relative flex h-10 w-full items-center sm:w-64"><SearchIcon aria-hidden="true" className="absolute left-3 size-4 text-muted" /><span className="sr-only">{t('Search members')}</span><input aria-label={t('Search members')} className="h-full w-full bg-transparent pl-10 pr-3 text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder={t('Search members')} type="search" value={query} /></label></div>
            <div className="divide-y divide-border">{filteredMembers.map((member) => <div className="flex items-center justify-between gap-4 px-5 py-4" key={member.email}><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface-high text-xs font-bold">{member.initials}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{member.name}</p><p className="truncate text-xs text-muted">{member.email}</p></div></div><div className="flex items-center gap-2"><Badge tone={member.tone}>{t(member.roleKey)}</Badge><Button aria-label={t('Member actions')} className="size-9 min-h-9 px-0" title={t('Member actions')} variant="quiet"><EllipsisIcon aria-hidden="true" /></Button></div></div>)}</div>
            {filteredMembers.length === 0 && <p className="p-8 text-center text-sm text-muted">{t('No members match this search.')}</p>}
          </Panel>

          <Panel className="overflow-hidden border-dashed" muted>
            <div className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold text-muted">{t('Pending invitations')}</h2></div>
            <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full border border-dashed border-border text-muted"><MailIcon aria-hidden="true" className="size-4" /></span><div><p className="text-sm">david.wu@example.com</p><p className="text-xs text-muted">{t('Invited 2 days ago as Developer')}</p></div></div><div className="flex gap-2"><Button variant="quiet">{t('Resend')}</Button><Button variant="danger">{t('Revoke')}</Button></div></div>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel className="p-6">
            <h2 className="flex items-center gap-3 text-lg font-bold"><Building2Icon aria-hidden="true" className="size-5 text-info" />{t('Organization profile')}</h2>
            <div className="mt-6 flex flex-col gap-4"><label className="flex flex-col gap-2 text-sm font-medium text-muted">{t('Organization name')}<input className="field px-3 text-sm" defaultValue="Acme Corp" /></label><label className="flex flex-col gap-2 text-sm font-medium text-muted">{t('Namespace slug')}<span className="flex"><span className="field mono flex items-center rounded-r-none border-r-0 px-3 text-xs text-muted">models.one/</span><input className="field mono min-w-0 flex-1 rounded-l-none px-3 text-xs" defaultValue="acme-corp" /></span></label></div>
          </Panel>
          <Panel className="p-6">
            <h2 className="flex items-center gap-3 text-lg font-bold"><CreditCardIcon aria-hidden="true" className="size-5 text-secondary" />{t('Shared billing')}</h2>
            <div className="mt-6 flex items-center justify-between border-y border-border py-4"><div><p className="text-xs text-muted">{t('Current plan')}</p><p className="mt-1 text-sm font-semibold">{t('Billed annually')}</p></div><Badge tone="secondary">{t('Enterprise')}</Badge></div>
            <div className="mt-5"><div className="mb-2 flex justify-between text-xs"><span className="text-muted">{t('API request limit')}</span><span className="mono">850K / 1M</span></div><div className="h-1.5 bg-surface-high"><div className="h-full w-[85%] bg-secondary" /></div></div>
            <Button className="mt-6 w-full" variant="outline">{t('Manage billing')}</Button>
          </Panel>
        </div>
      </div>
    </div>
  )
}
