import { useMutation, useQueryClient } from '@tanstack/react-query'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert } from '@/components/ui'
import { logout } from '@/features/auth/api'
import { deleteSelfAccount } from '@/features/profile/identity-api'
import { clearAuthenticatedClientState } from '@/lib/auth-session'
import { redirectToLegacySignIn } from '@/lib/navigation'

type DeleteAccountDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The exact word the user must type; also what the server knows the account by. */
  username: string
}

/**
 * `DELETE /api/user/self` is final: `model.DeleteUserById` marks the account deleted and
 * the console has no route that brings one back. The type-to-confirm gate is the kit's, so
 * the destructive button stays disabled until the username is typed exactly.
 *
 * The request carries no body — `DeleteSelf` reads the id off the session and ignores
 * whatever is sent — so there is no password re-entry to collect here.
 */
export function DeleteAccountDialog(props: DeleteAccountDialogProps) {
  const { onOpenChange, open, username } = props
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      await deleteSelfAccount()
      // The account is gone either way; a logout that fails must not strand the browser
      // on a console it can no longer talk to.
      try {
        await logout()
      } catch {
        // Ignored: see above.
      }
    },
    onError: (failure: unknown) => toast.error(toErrorMessage(failure)),
    onSuccess: () => {
      clearAuthenticatedClientState(queryClient)
      toast.success(t('Your account has been deleted.'))
      // No `redirect` parameter: there is nothing left to come back to.
      redirectToLegacySignIn('')
    },
  })

  return (
    <ConfirmDialog
      cancelLabel={t('Cancel')}
      confirmLabel={t('Delete account')}
      confirmPhrase={username}
      description={t('This cannot be undone.')}
      destructive
      isLoading={mutation.isPending}
      onConfirm={() => mutation.mutate()}
      onOpenChange={(next) => {
        if (mutation.isPending && !next) return
        onOpenChange(next)
      }}
      open={open}
      title={t('Delete account')}
    >
      <Alert icon={<TriangleAlertIcon />} title={t('What you lose')} tone="destructive">
        <ul className="ml-4 list-disc space-y-1">
          <li>{t('Your remaining balance, which is not refunded.')}</li>
          <li>{t('Every API key on this account — calls using them stop working immediately.')}</li>
          <li>{t('Your usage and billing history, which cannot be exported afterwards.')}</li>
          <li>{t('Every linked sign-in method, and the referral code you have shared.')}</li>
        </ul>
      </Alert>
    </ConfirmDialog>
  )
}
