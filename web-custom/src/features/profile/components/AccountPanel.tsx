import { useMutation, useQueryClient } from '@tanstack/react-query'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import UserPenIcon from 'lucide-react/dist/esm/icons/user-pen'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form'
import { toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, IconBadge, Panel } from '@/components/ui'
import { ChangePasswordDialog } from '@/features/profile/components/ChangePasswordDialog'
import { DeleteAccountDialog } from '@/features/profile/components/DeleteAccountDialog'
import { ROLE_ROOT, updateDisplayName } from '@/features/profile/identity-api'
import { selfUserQuery, type SelfUser } from '@/lib/api/user'

/**
 * `model.User` validation tag `DisplayName max=20`. `UpdateSelf` runs the struct through
 * `common.Validate` before touching the row, so a longer name is refused with the generic
 * "Invalid input" — the form refuses it first, with a message that says why.
 */
export const DISPLAY_NAME_MAX_LENGTH = 20

type AccountPanelProps = {
  user: SelfUser
}

/**
 * The two edits `PUT /api/user/self` accepts on a profile, plus the one deletion
 * `DELETE /api/user/self` performs.
 *
 * Password and deletion each live behind their own dialog because both have consequences
 * the button label cannot carry: the first rotates the session token, the second is final.
 */
export function AccountPanel(props: AccountPanelProps) {
  const { user } = props
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [displayName, setDisplayName] = useState(user.display_name)
  const [error, setError] = useState<string | null>(null)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const isRoot = user.role === ROLE_ROOT
  const trimmed = displayName.trim()
  const tooLong = trimmed.length > DISPLAY_NAME_MAX_LENGTH
  const unchanged = trimmed === user.display_name.trim()

  const saveName = useMutation({
    mutationFn: (name: string) => updateDisplayName(name),
    onSuccess: async () => {
      setError(null)
      toast.success(t('Display name updated'))
      await queryClient.invalidateQueries({ queryKey: selfUserQuery().queryKey })
    },
    onError: (failure: unknown) => setError(toErrorMessage(failure)),
  })

  return (
    <>
      <Panel>
        <Panel.Header
          description={t('The name other people see, and the password you sign in with.')}
          icon={<IconBadge icon={<UserPenIcon />} size="sm" tone="primary" />}
          title={t('Profile')}
        />
        <Panel.Body className="flex flex-col gap-6 p-6">
          <form
            className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start"
            onSubmit={(event) => {
              event.preventDefault()
              if (tooLong || unchanged || saveName.isPending) return
              saveName.mutate(trimmed)
            }}
          >
            <Input
              autoComplete="nickname"
              description={t('Up to {{count}} characters. Leave it empty to be shown as your username.', {
                count: DISPLAY_NAME_MAX_LENGTH,
              })}
              error={
                tooLong
                  ? t('That is longer than {{count}} characters, which the server refuses.', {
                    count: DISPLAY_NAME_MAX_LENGTH,
                  })
                  : error
              }
              label={t('Display name')}
              onChange={(event) => {
                setDisplayName(event.target.value)
                setError(null)
              }}
              placeholder={user.username}
              value={displayName}
            />
            <Button
              aria-busy={saveName.isPending}
              className="md:mt-7"
              disabled={saveName.isPending || tooLong || unchanged}
              type="submit"
            >
              {t('Save name')}
            </Button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                <KeyRoundIcon aria-hidden="true" className="size-4 text-muted" />
                {t('Password')}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {t('Changing it issues a new session token for this browser. Other signed-in devices are signed out.')}
              </p>
            </div>
            <Button onClick={() => setPasswordOpen(true)} variant="outline">
              {t('Change password')}
            </Button>
          </div>
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Header
          description={t('Deleting your account cannot be undone.')}
          icon={<IconBadge icon={<TriangleAlertIcon />} size="sm" tone="destructive" />}
          title={t('Danger zone')}
        />
        <Panel.Body className="p-6">
          {isRoot ? (
            <Alert
              icon={<TriangleAlertIcon />}
              title={t('This account cannot be deleted')}
              tone="warning"
            >
              {t('The server refuses to delete the super administrator account. Ask another administrator to remove it, or hand the role over first.')}
            </Alert>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{t('Delete this account')}</p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                  {t('Your balance, API keys, usage history and sign-in methods go with it. There is no undo and no export afterwards.')}
                </p>
              </div>
              <Button onClick={() => setDeleteOpen(true)} variant="danger">
                {t('Delete account')}
              </Button>
            </div>
          )}
        </Panel.Body>
      </Panel>

      <ChangePasswordDialog
        onOpenChange={setPasswordOpen}
        open={passwordOpen}
        username={user.username}
      />
      <DeleteAccountDialog
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        username={user.username}
      />
    </>
  )
}
