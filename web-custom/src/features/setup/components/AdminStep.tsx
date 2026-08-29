import ShieldCheckIcon from 'lucide-react/dist/esm/icons/shield-check'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form/Input'
import { PasswordInput } from '@/components/form/PasswordInput'
import { Alert } from '@/components/ui/Alert'
import {
  MAX_USERNAME_BYTES,
  MIN_PASSWORD_LENGTH,
  type SetupCredentialErrors,
  type SetupCredentials,
} from '@/features/setup/api'

type AdminStepProps = {
  values: SetupCredentials
  errors: SetupCredentialErrors
  rootInitialized: boolean
  disabled: boolean
  onChange: (patch: Partial<SetupCredentials>) => void
}

export function AdminStep(props: AdminStepProps) {
  const { t } = useTranslation()

  if (props.rootInitialized) {
    return (
      <Alert
        icon={<ShieldCheckIcon />}
        title={t('An administrator account already exists.')}
        tone="info"
      >
        {t(
          'This server already has a root user, so the installer will not create another one. Continue with your existing credentials.',
        )}
      </Alert>
    )
  }

  const messages: Record<string, string> = {
    'password-mismatch': t('The two passwords do not match.'),
    'password-too-short': t('Use at least {{count}} characters.', { count: MIN_PASSWORD_LENGTH }),
    'username-required': t('Enter a username for the administrator account.'),
    'username-too-long': t('Use at most {{count}} characters.', { count: MAX_USERNAME_BYTES }),
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Input
        autoComplete="username"
        className="sm:col-span-2"
        description={t('Up to {{count}} characters. This becomes the root account.', {
          count: MAX_USERNAME_BYTES,
        })}
        disabled={props.disabled}
        error={props.errors.username ? messages[props.errors.username] : undefined}
        label={t('Administrator username')}
        name="username"
        onChange={(event) => props.onChange({ username: event.target.value })}
        required
        value={props.values.username}
      />

      <PasswordInput
        autoComplete="new-password"
        description={t('At least {{count}} characters.', { count: MIN_PASSWORD_LENGTH })}
        disabled={props.disabled}
        error={props.errors.password ? messages[props.errors.password] : undefined}
        label={t('Password')}
        name="new-password"
        onChange={(event) => props.onChange({ password: event.target.value })}
        required
        value={props.values.password}
      />

      <PasswordInput
        autoComplete="new-password"
        disabled={props.disabled}
        error={props.errors.confirmPassword ? messages[props.errors.confirmPassword] : undefined}
        label={t('Confirm password')}
        name="confirm-password"
        onChange={(event) => props.onChange({ confirmPassword: event.target.value })}
        required
        value={props.values.confirmPassword}
      />
    </div>
  )
}
