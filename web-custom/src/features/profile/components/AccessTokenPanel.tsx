import { useMutation } from '@tanstack/react-query'
import ShieldIcon from 'lucide-react/dist/esm/icons/shield'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog, toErrorMessage } from '@/components/overlay'
import { Alert, Button, IconBadge, MaskedValue, Panel } from '@/components/ui'
import { generateAccessToken } from '@/features/profile/identity-api'

/**
 * The system access token — a personal token for the MANAGEMENT API, not an API key for
 * inference. `middleware/auth.go classifyDashboardCredential` accepts it as
 * `Authorization: Bearer <token>` on `/api/…` routes; `sk-…` keys are a different thing
 * entirely and live on the API keys page.
 *
 * `GET /api/user/token` is the only route that touches it, and it MINTS. There is no route
 * that reads the current token back — `GET /api/user/self` does not include it (verified
 * live) — so generating replaces the old one irreversibly and this render is the only place
 * the value is ever visible.
 */
export function AccessTokenPanel() {
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  const generate = useMutation({
    mutationFn: generateAccessToken,
    onSuccess: (value) => {
      setConfirmOpen(false)
      setToken(value)
    },
  })

  return (
    <>
      <Panel>
        <Panel.Header
          description={t('A personal token for the management API, sent as a bearer token.')}
          icon={<IconBadge icon={<ShieldIcon />} size="sm" tone="secondary" />}
          title={t('System access token')}
        />
        <Panel.Body className="flex flex-col gap-4 p-6">
          <p className="text-sm leading-6 text-muted">
            {t('This is not an inference API key. It authenticates calls to the console API on your behalf, with your permissions.')}
          </p>

          {generate.isError ? (
            <Alert title={t('The token could not be generated')} tone="destructive">
              {toErrorMessage(generate.error)}
            </Alert>
          ) : null}

          {token === null ? (
            <Alert tone="muted">
              {t('The server never returns an existing token, so there is nothing to show here. Generating one replaces whatever token this account already has.')}
            </Alert>
          ) : (
            <div className="flex flex-col gap-3">
              <Alert icon={<TriangleAlertIcon />} title={t('Copy it now')} tone="warning">
                {t('This is the only time the token is shown. Leaving or reloading this page loses it, and the only way back is to generate another one.')}
              </Alert>
              <MaskedValue
                copyLabel={t('Copy access token')}
                copyable
                hideLabel={t('Hide access token')}
                showLabel={t('Show access token')}
                value={token}
              />
            </div>
          )}

          <div>
            <Button
              aria-busy={generate.isPending}
              disabled={generate.isPending}
              onClick={() => setConfirmOpen(true)}
              variant="outline"
            >
              {token === null ? t('Generate a token') : t('Generate a new token')}
            </Button>
          </div>
        </Panel.Body>
      </Panel>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Generate token')}
        description={t('Any token this account already has stops working the moment the new one is issued.')}
        destructive
        isLoading={generate.isPending}
        onConfirm={() => generate.mutate()}
        onOpenChange={(next) => {
          if (generate.isPending) return
          setConfirmOpen(next)
        }}
        open={confirmOpen}
        title={t('Generate a new access token')}
      >
        <Alert icon={<TriangleAlertIcon />} tone="warning">
          {t('Anything already using the old token — scripts, integrations, another browser — starts failing immediately.')}
        </Alert>
      </ConfirmDialog>
    </>
  )
}
