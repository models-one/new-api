import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form'
import { Dialog, toErrorMessage, toast } from '@/components/overlay'
import { Button } from '@/components/ui'
import { clusterNameCheckQuery, renameDeployment } from '@/features/deployments/api'
import { isBlankName } from '@/features/deployments/deployment-presentation'

type RenameDeploymentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The deployment being renamed; the dialog is inert without it. */
  deploymentId: string | undefined
  currentName: string
  onRenamed: () => void
}

/**
 * `PUT /api/deployments/:id/name`.
 *
 * The handler runs `CheckClusterNameAvailability` itself before it calls io.net and
 * refuses a taken name, so this form asks the same question up front rather than letting
 * the write fail. The server remains the boundary — this check is only a courtesy.
 */
export function RenameDeploymentDialog(props: RenameDeploymentDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(props.currentName)

  useEffect(() => {
    if (props.open) setName(props.currentName)
  }, [props.currentName, props.open])

  const trimmed = name.trim()
  const unchanged = trimmed === props.currentName.trim()

  const checkQuery = useQuery(
    clusterNameCheckQuery(trimmed, props.open && !isBlankName(trimmed) && !unchanged),
  )

  const mutation = useMutation({
    mutationFn: (next: string) => renameDeployment(props.deploymentId ?? '', next),
    onSuccess: (result) => {
      toast.success(t('Renamed to “{{name}}”', { name: result.name }))
      props.onRenamed()
      props.onOpenChange(false)
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  const taken = checkQuery.data !== undefined && !checkQuery.data.available
  const checking = checkQuery.isFetching

  const blockReason = ((): string | undefined => {
    if (props.deploymentId === undefined) return t('No deployment is selected.')
    if (isBlankName(trimmed)) return t('A name is required.')
    if (unchanged) return t('That is already the name of this deployment.')
    if (checking) return t('The name is still being checked.')
    if (taken) return t('io.net already has a cluster with that name.')
    return undefined
  })()

  const nameError = ((): string | undefined => {
    if (taken) return t('io.net already has a cluster with that name.')
    if (checkQuery.isError) return toErrorMessage(checkQuery.error)
    return undefined
  })()

  const nameDescription = ((): string => {
    if (unchanged && !isBlankName(trimmed)) return t('Unchanged.')
    if (checking) return t('Checking availability…')
    if (checkQuery.data?.available === true) return t('Available.')
    return t('Cluster names are unique across the io.net account.')
  })()

  return (
    <Dialog
      description={t('Renaming changes the cluster name at io.net. It does not restart or re-provision anything, and it costs nothing.')}
      footer={(
        <>
          <Button disabled={mutation.isPending} onClick={() => props.onOpenChange(false)} variant="quiet">
            {t('Cancel')}
          </Button>
          <Button
            aria-busy={mutation.isPending}
            disabled={mutation.isPending || blockReason !== undefined}
            onClick={() => mutation.mutate(trimmed)}
            title={blockReason}
            variant="primary"
          >
            {t('Rename')}
          </Button>
        </>
      )}
      onOpenChange={(open) => {
        if (!open && mutation.isPending) return
        props.onOpenChange(open)
      }}
      open={props.open}
      size="sm"
      title={t('Rename deployment')}
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs leading-5 text-muted">
          {t('Deployment')} <span className="mono">{props.deploymentId ?? '—'}</span>
        </p>
        <Input
          description={nameDescription}
          error={nameError}
          inputClassName="mono"
          label={t('New name')}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
        {blockReason === undefined ? null : (
          <p className="text-xs leading-5 text-muted">{blockReason}</p>
        )}
      </div>
    </Dialog>
  )
}
