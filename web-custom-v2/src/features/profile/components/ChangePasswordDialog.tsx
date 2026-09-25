import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PasswordInput } from '@/components/form'
import { Dialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  changePassword,
} from '@/features/profile/identity-api'

type ChangePasswordDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string
}

export type PasswordIssue =
  | 'original_required'
  | 'too_short'
  | 'too_long'
  | 'same_as_current'
  | 'mismatch'
  | null

/**
 * The checks the server would make anyway, made first so the user is told which one failed.
 * `model.User` carries `Password min=8,max=20`; a violation answers the undifferentiated
 * "Invalid input", and `checkUpdatePassword` answers "Original password is incorrect".
 */
export function validatePasswordChange(values: {
  original: string
  next: string
  confirm: string
}): PasswordIssue {
  if (values.original === '') return 'original_required'
  if (values.next.length < PASSWORD_MIN_LENGTH) return 'too_short'
  if (values.next.length > PASSWORD_MAX_LENGTH) return 'too_long'
  if (values.next === values.original) return 'same_as_current'
  if (values.next !== values.confirm) return 'mismatch'
  return null
}

const EMPTY = { confirm: '', next: '', original: '' }

export function ChangePasswordDialog(props: ChangePasswordDialogProps) {
  const { onOpenChange, open, username } = props
  const { t } = useTranslation()

  const [values, setValues] = useState(EMPTY)
  const [issue, setIssue] = useState<PasswordIssue>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setValues(EMPTY)
      setIssue(null)
      setError(null)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      toast.success(t('Password changed'))
      onOpenChange(false)
    },
    onError: (failure: unknown) => setError(toErrorMessage(failure)),
  })

  const issueMessages: Record<Exclude<PasswordIssue, null>, string> = {
    mismatch: t('The two new passwords do not match.'),
    original_required: t('Enter your current password.'),
    same_as_current: t('The new password is the same as the current one.'),
    too_long: t('Use at most {{count}} characters.', { count: PASSWORD_MAX_LENGTH }),
    too_short: t('Use at least {{count}} characters.', { count: PASSWORD_MIN_LENGTH }),
  }

  const submit = () => {
    const found = validatePasswordChange(values)
    setIssue(found)
    setError(null)
    if (found !== null) return
    mutation.mutate({ newPassword: values.next, originalPassword: values.original })
  }

  const formId = 'profile-change-password'

  return (
    <Dialog
      description={t('Signing in as {{username}} will use the new password.', { username })}
      footer={
        <>
          <Button disabled={mutation.isPending} onClick={() => onOpenChange(false)} variant="quiet">
            {t('Cancel')}
          </Button>
          <Button
            aria-busy={mutation.isPending}
            disabled={mutation.isPending}
            form={formId}
            type="submit"
          >
            {t('Change password')}
          </Button>
        </>
      }
      onOpenChange={(next) => {
        if (mutation.isPending && !next) return
        onOpenChange(next)
      }}
      open={open}
      scrollBody={false}
      size="sm"
      title={t('Change password')}
    >
      <form
        className="flex flex-col gap-4"
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Alert tone="warning">
          {t('Every other signed-in device is signed out. This browser keeps working — it is issued a fresh token.')}
        </Alert>

        {error === null ? null : (
          <Alert tone="destructive">{error}</Alert>
        )}

        <PasswordInput
          autoComplete="current-password"
          disabled={mutation.isPending}
          error={issue === 'original_required' ? issueMessages.original_required : undefined}
          label={t('Current password')}
          onChange={(event) => {
            setValues((current) => ({ ...current, original: event.target.value }))
            setIssue(null)
          }}
          required
          value={values.original}
        />
        <PasswordInput
          autoComplete="new-password"
          description={t('Between {{min}} and {{max}} characters.', {
            max: PASSWORD_MAX_LENGTH,
            min: PASSWORD_MIN_LENGTH,
          })}
          disabled={mutation.isPending}
          error={
            issue === 'too_short' || issue === 'too_long' || issue === 'same_as_current'
              ? issueMessages[issue]
              : undefined
          }
          label={t('New password')}
          onChange={(event) => {
            setValues((current) => ({ ...current, next: event.target.value }))
            setIssue(null)
          }}
          required
          value={values.next}
        />
        <PasswordInput
          autoComplete="new-password"
          disabled={mutation.isPending}
          error={issue === 'mismatch' ? issueMessages.mismatch : undefined}
          label={t('Confirm new password')}
          onChange={(event) => {
            setValues((current) => ({ ...current, confirm: event.target.value }))
            setIssue(null)
          }}
          required
          value={values.confirm}
        />
      </form>
    </Dialog>
  )
}
