import { useMutation, useQuery } from '@tanstack/react-query'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import UserPlusIcon from 'lucide-react/dist/esm/icons/user-plus'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NativeSelect, PasswordInput, RadioGroup, Textarea, type NativeSelectOption, type RadioOption } from '@/components/form'
import { Drawer, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, Skeleton } from '@/components/ui'
import {
  createUser,
  fetchAdminUser,
  updateUser,
  userGroupNamesQuery,
  type AdminUser,
} from '@/features/users/api'
import {
  creatableRoles,
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REMARK_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  userRoleLabel,
  validateUserForm,
  type UserFormErrorCode,
  type UserFormErrors,
  type UserFormValues,
} from '@/features/users/user-presentation'

type UserDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present in edit mode; omitted when the drawer creates an account. */
  user?: AdminUser
  /** The signed-in admin's role — it decides which roles may be created. */
  viewerRole: number
  /** Fired whenever the server state changed, so the table can refetch. */
  onChanged: () => void
}

const DEFAULT_GROUP = 'default'

function emptyForm(viewerRole: number): UserFormValues {
  return {
    display_name: '',
    group: DEFAULT_GROUP,
    password: '',
    remark: '',
    role: creatableRoles(viewerRole)[0] ?? 1,
    username: '',
  }
}

export function UserDrawer(props: UserDrawerProps) {
  const { t } = useTranslation()
  const isEdit = props.user !== undefined
  const editId = props.user?.id

  const [values, setValues] = useState<UserFormValues>(() => emptyForm(props.viewerRole))
  const [errors, setErrors] = useState<UserFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  /**
   * Editing re-reads the row rather than trusting the list page, which may be
   * minutes old by the time an admin opens the drawer. It also carries `remark`,
   * which the list omits entirely when it is empty.
   */
  const currentQuery = useQuery({
    queryKey: ['users', 'detail', editId],
    queryFn: () => fetchAdminUser(editId as number),
    enabled: props.open && editId !== undefined,
    staleTime: 0,
    gcTime: 0,
  })
  const current = currentQuery.data

  const groupsQuery = useQuery({ ...userGroupNamesQuery(), enabled: props.open && isEdit })

  useEffect(() => {
    if (!props.open) return
    setErrors({})
    setSubmitError(null)
    if (!isEdit) setValues(emptyForm(props.viewerRole))
  }, [isEdit, props.open, props.viewerRole])

  useEffect(() => {
    if (current === undefined) return
    setValues({
      display_name: current.display_name,
      group: current.group,
      password: '',
      remark: current.remark ?? '',
      role: current.role,
      username: current.username,
    })
  }, [current])

  const mutation = useMutation({
    mutationFn: async (form: UserFormValues) => {
      const username = form.username.trim()
      const displayName = form.display_name.trim()

      if (isEdit && editId !== undefined) {
        return updateUser({
          display_name: displayName,
          group: form.group,
          id: editId,
          // EditWithTx writes `remark` unconditionally, so the current value has to
          // travel with every save or an unrelated edit would blank it.
          remark: form.remark,
          username,
          ...(form.password === '' ? {} : { password: form.password }),
        })
      }

      return createUser({
        // CreateUser copies the username when display_name is blank; sending the
        // username outright keeps the drawer and the row in agreement.
        display_name: displayName === '' ? username : displayName,
        password: form.password,
        role: form.role,
        username,
      })
    },
    onSuccess: () => {
      toast.success(isEdit ? t('Account updated') : t('Account created'))
      props.onChanged()
      props.onOpenChange(false)
    },
    onError: (error: unknown) => setSubmitError(toErrorMessage(error)),
  })

  const handleSubmit = () => {
    setSubmitError(null)
    const nextErrors = validateUserForm(values, { isEdit })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    mutation.mutate(values)
  }

  /** Turns a validator code into the sentence the field shows. */
  const resolveError = (code: UserFormErrorCode | undefined): string | undefined => {
    if (code === 'username-length') {
      return t('Enter a username of 1 to {{max}} characters.', { max: USERNAME_MAX_LENGTH })
    }
    if (code === 'display-name-length') {
      return t('A display name can be at most {{max}} characters.', { max: DISPLAY_NAME_MAX_LENGTH })
    }
    if (code === 'password-required') return t('A password is required for a new account.')
    if (code === 'password-length') {
      return t('A password must be {{min}} to {{max}} characters.', {
        max: PASSWORD_MAX_LENGTH,
        min: PASSWORD_MIN_LENGTH,
      })
    }
    if (code === 'remark-length') {
      return t('An admin note can be at most {{max}} characters.', { max: REMARK_MAX_LENGTH })
    }
    return undefined
  }

  const roleOptions: RadioOption<string>[] = creatableRoles(props.viewerRole).map((role) => ({
    value: String(role),
    label: t(userRoleLabel(role)),
    description: role >= 10
      ? t('Reaches every administrator endpoint, including this page.')
      : t('Can spend its own balance and manage its own keys.'),
  }))

  /**
   * The current group is always offered, even when `GET /api/group/` no longer
   * lists it — a group can be removed from the setting while accounts still sit in
   * it, and dropping it here would silently move the account on the next save.
   */
  const groupNames = groupsQuery.data ?? []
  const groupOptions: NativeSelectOption[] = (
    groupNames.includes(values.group) ? groupNames : [values.group, ...groupNames]
  ).map((group) => ({ label: group, value: group }))

  const describeDrawer = (): string => {
    if (isEdit) {
      return t('Username, display name, group, admin note and password. Balance, role and status are changed from the row menu instead.')
    }
    return t('A username, a password and a role. Everything else is set after the account exists.')
  }

  const body = (() => {
    if (isEdit && currentQuery.isPending) {
      return (
        <div aria-busy="true" className="flex flex-col gap-4" role="status">
          <span className="sr-only">{t('Loading the account')}</span>
          <Skeleton height={64} variant="block" />
          <Skeleton height={64} variant="block" />
          <Skeleton height={64} variant="block" />
          <Skeleton height={120} variant="block" />
        </div>
      )
    }

    if (isEdit && currentQuery.isError) {
      return (
        <Alert
          action={
            <Button
              aria-busy={currentQuery.isFetching}
              disabled={currentQuery.isFetching}
              onClick={() => void currentQuery.refetch()}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('Could not load this account')}
          tone="destructive"
        >
          {toErrorMessage(currentQuery.error)}
        </Alert>
      )
    }

    return (
      <form
        className="flex flex-col gap-6"
        id="user-drawer-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        {submitError === null ? null : (
          <Alert
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('The server rejected this')}
            tone="destructive"
          >
            {submitError}
          </Alert>
        )}

        <Input
          description={t('Unique across the deployment. Up to {{max}} characters.', {
            max: USERNAME_MAX_LENGTH,
          })}
          error={resolveError(errors.username)}
          label={t('Username')}
          maxLength={USERNAME_MAX_LENGTH}
          onChange={(event) => setValues((prev) => ({ ...prev, username: event.target.value }))}
          required
          value={values.username}
        />

        <Input
          description={t('Shown beside the username. Left blank, the username is used.')}
          error={resolveError(errors.display_name)}
          label={t('Display name')}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          onChange={(event) => setValues((prev) => ({ ...prev, display_name: event.target.value }))}
          value={values.display_name}
        />

        <PasswordInput
          autoComplete="new-password"
          description={
            isEdit
              ? t('Leave blank to keep the current password. {{min}} to {{max}} characters.', {
                max: PASSWORD_MAX_LENGTH,
                min: PASSWORD_MIN_LENGTH,
              })
              : t('{{min}} to {{max}} characters. Share it with the account holder over a private channel.', {
                max: PASSWORD_MAX_LENGTH,
                min: PASSWORD_MIN_LENGTH,
              })
          }
          error={resolveError(errors.password)}
          label={isEdit ? t('New password') : t('Password')}
          maxLength={PASSWORD_MAX_LENGTH}
          onChange={(event) => setValues((prev) => ({ ...prev, password: event.target.value }))}
          required={!isEdit}
          value={values.password}
        />

        {isEdit ? (
          <>
            <NativeSelect
              description={
                groupsQuery.isError
                  ? t('The group list could not be loaded, so only the current group is offered.')
                  : t('Decides which billing ratio the account is charged at.')
              }
              label={t('Group')}
              onChange={(event) => setValues((prev) => ({ ...prev, group: event.target.value }))}
              options={groupOptions}
              value={values.group}
            />

            <Textarea
              description={t('Private to administrators. Up to {{max}} characters.', {
                max: REMARK_MAX_LENGTH,
              })}
              error={resolveError(errors.remark)}
              label={t('Admin note')}
              maxLength={REMARK_MAX_LENGTH}
              onChange={(event) => setValues((prev) => ({ ...prev, remark: event.target.value }))}
              rows={3}
              value={values.remark}
            />
          </>
        ) : (
          <RadioGroup<string>
            description={t('An account can never be created at or above your own role.')}
            label={t('Role')}
            onValueChange={(role) => setValues((prev) => ({ ...prev, role: Number(role) }))}
            options={roleOptions}
            value={String(values.role)}
            variant="card"
          />
        )}
      </form>
    )
  })()

  const footer = (
    <>
      <Button disabled={mutation.isPending} onClick={() => props.onOpenChange(false)} variant="quiet">
        {t('Cancel')}
      </Button>
      <Button
        aria-busy={mutation.isPending}
        disabled={mutation.isPending || (isEdit && current === undefined)}
        form="user-drawer-form"
        type="submit"
        variant="primary"
      >
        {isEdit ? t('Save changes') : t('Create account')}
      </Button>
    </>
  )

  return (
    <Drawer
      description={describeDrawer()}
      footer={footer}
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="lg"
      title={isEdit ? t('Edit account') : t('New account')}
    >
      <div className="flex flex-col gap-6">
        {isEdit ? null : (
          <p className="flex items-center gap-2 text-sm leading-6 text-muted">
            <UserPlusIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
            {t('The account starts with an empty balance in the default group.')}
          </p>
        )}
        {body}
      </div>
    </Drawer>
  )
}
