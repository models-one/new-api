import { useQuery } from '@tanstack/react-query'
import BanknoteIcon from 'lucide-react/dist/esm/icons/banknote'
import WalletCardsIcon from 'lucide-react/dist/esm/icons/wallet-cards'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  CopyButton,
  DescriptionList,
  PageHeader,
  Panel,
  Skeleton,
  StatCard,
  type DescriptionListItem,
} from '@/components/ui'
import { displayNameOf, roleKeyOf, type RoleKey } from '@/features/profile/identity'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { selfUserQuery } from '@/lib/api/user'
import { quotaToCurrency, splitCurrency } from '@/lib/format'

/**
 * The account header: who this is, what the deployment lets them do, and the two money
 * figures `GET /api/user/self` carries. Everything on it is a field of that one response —
 * nothing is computed except the currency conversion, which divides by `quota_per_unit`
 * from `GET /api/status`.
 *
 * This component emits the page's `<h1>`. A page composing it must not add another.
 */

/** Renders "$501" large with ".89" reduced, the way the console shows money. */
function CurrencyValue(props: { amount: number }) {
  const { whole, fraction } = splitCurrency(props.amount)
  return (
    <>
      {whole}
      <span className="text-2xl font-bold text-muted">{fraction}</span>
    </>
  )
}

function roleTone(role: RoleKey): 'primary' | 'info' | 'muted' {
  if (role === 'root') return 'primary'
  if (role === 'admin') return 'info'
  return 'muted'
}

export function ProfileHeader() {
  const { t } = useTranslation()
  const quotaPerUnit = useQuotaPerUnit()
  const selfQuery = useQuery(selfUserQuery())

  const roleLabels: Record<RoleKey, string> = {
    guest: t('Guest'),
    user: t('User'),
    admin: t('Administrator'),
    root: t('Super administrator'),
    unknown: t('Unrecognised role'),
  }

  if (selfQuery.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader description={t('Your identity, sign-in methods and account controls.')} title={t('Account')} />
        <Alert
          action={
            <Button
              aria-busy={selfQuery.isFetching}
              disabled={selfQuery.isFetching}
              onClick={() => void selfQuery.refetch()}
              size="sm"
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          title={t('Your account could not be loaded')}
          tone="destructive"
        >
          {toErrorMessage(selfQuery.error)}
        </Alert>
      </div>
    )
  }

  const user = selfQuery.data

  if (user === undefined) {
    return (
      <div aria-busy="true" className="flex flex-col gap-6" role="status">
        <span className="sr-only">{t('Loading your account')}</span>
        <PageHeader description={t('Your identity, sign-in methods and account controls.')} title={t('Account')} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <Panel as="div" className="p-6">
            <Skeleton height={20} variant="block" width={180} />
            <Skeleton className="mt-6" height={140} variant="block" />
          </Panel>
          <div className="grid gap-4">
            {[t('Current balance'), t('Lifetime usage')].map((label) => (
              <Panel as="div" className="flex flex-col p-6" key={label}>
                <p className="eyebrow">{label}</p>
                <Skeleton className="mt-4" height={36} variant="block" width={128} />
              </Panel>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const name = displayNameOf(user)
  const role = roleKeyOf(user.role)
  const affCode = user.aff_code.trim()

  const details: DescriptionListItem[] = [
    { term: t('Username'), description: <span className="mono">{user.username}</span>, id: 'username' },
    {
      description: user.display_name.trim() === ''
        ? <span className="text-muted">{t('Not set — your username is shown instead')}</span>
        : user.display_name,
      id: 'display-name',
      term: t('Display name'),
    },
    { term: t('User ID'), description: <span className="mono">{user.id}</span>, id: 'user-id' },
    {
      description: <Badge tone="muted"><span className="mono">{user.group}</span></Badge>,
      id: 'group',
      term: t('Billing group'),
    },
    {
      description: affCode === '' ? (
        <span className="text-muted">{t('Not generated yet — open Referrals to create one')}</span>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="mono truncate">{affCode}</span>
          <CopyButton label={t('Copy referral code')} size="icon-sm" value={affCode} />
        </span>
      ),
      id: 'referral',
      term: t('Referral code'),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description={t('Your identity, sign-in methods and account controls.')}
        status={
          <Badge tone={roleTone(role)}>
            {roleLabels[role]}
          </Badge>
        }
        title={t('Account')}
      />

      <div
        aria-busy={selfQuery.isFetching}
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start"
      >
        <Panel as="div">
          <div className="flex items-center gap-4 border-b border-border px-5 py-4">
            <Avatar decorative name={name} size="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold text-foreground">{name}</h2>
              <p className="mono truncate text-sm text-muted">
                {user.email.trim() === '' ? `@${user.username}` : user.email}
              </p>
            </div>
          </div>
          <Panel.Body>
            <DescriptionList items={details} label={t('Account details')} />
          </Panel.Body>
        </Panel>

        <div className="grid gap-4">
          <StatCard
            footer={t('Remaining prepaid quota')}
            icon={<WalletCardsIcon />}
            iconTone="primary"
            label={t('Current balance')}
            value={<CurrencyValue amount={quotaToCurrency(user.quota, quotaPerUnit)} />}
          />
          <StatCard
            footer={t('Everything spent on this account so far')}
            icon={<BanknoteIcon />}
            iconTone="info"
            label={t('Lifetime usage')}
            value={<CurrencyValue amount={quotaToCurrency(user.used_quota, quotaPerUnit)} />}
          />
        </div>
      </div>
    </div>
  )
}
