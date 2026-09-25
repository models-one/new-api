import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SkipToMain } from '@/components/system/SkipToMain'
import { toErrorMessage, toast } from '@/components/overlay/toast'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { Skeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'
import {
  buildSetupPayload,
  setupStatusQuery,
  submitSetup,
  validateSetupCredentials,
  type SetupCredentialErrors,
  type SetupCredentials,
  type SetupFormValues,
  type SetupStatus,
} from '@/features/setup/api'
import { AdminStep } from '@/features/setup/components/AdminStep'
import { DatabaseStep } from '@/features/setup/components/DatabaseStep'
import { ReviewStep } from '@/features/setup/components/ReviewStep'
import { StepIndicator, type SetupStepDescriptor } from '@/features/setup/components/StepIndicator'
import { UsageModeStep } from '@/features/setup/components/UsageModeStep'

const MAIN_ID = 'main-content'

const initialValues: SetupFormValues = {
  confirmPassword: '',
  password: '',
  usageMode: 'external',
  username: '',
}

/**
 * First-run installation wizard.
 *
 * Reachable ONLY while `GET /api/setup` reports `status: false`. The route guard in
 * `src/routes.tsx` redirects away before this renders, and the effect below covers the
 * cases the guard cannot: a status that flips while the page is open, and the redirect
 * that follows a successful `POST /api/setup`.
 */
export function SetupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: status, isPending, isError, refetch, isFetching } = useQuery(setupStatusQuery())

  const [currentStep, setCurrentStep] = useState(0)
  const [values, setValues] = useState<SetupFormValues>(initialValues)
  const [errors, setErrors] = useState<SetupCredentialErrors>({})

  const alreadyInitialized = status?.status === true

  useEffect(() => {
    if (alreadyInitialized) void navigate({ replace: true, to: '/' })
  }, [alreadyInitialized, navigate])

  const mutation = useMutation({
    mutationFn: submitSetup,
    onSuccess: async () => {
      toast.success(t('This deployment is initialized. Taking you to the sign-in page.'))
      await queryClient.invalidateQueries({ queryKey: ['setup-status'] })
      void navigate({ replace: true, to: '/' })
    },
  })

  const steps: readonly SetupStepDescriptor[] = [
    {
      description: t('Confirm what this server is running on'),
      id: 'database',
      title: t('Database'),
    },
    {
      description: t('Create the root account'),
      id: 'administrator',
      title: t('Administrator'),
    },
    {
      description: t('Choose how the deployment operates'),
      id: 'usage-mode',
      title: t('Usage mode'),
    },
    {
      description: t('Review and initialize'),
      id: 'review',
      title: t('Finish'),
    },
  ]

  const rootInitialized = status?.root_init === true
  const isLastStep = currentStep === steps.length - 1
  const submitting = mutation.isPending

  const updateCredentials = (patch: Partial<SetupCredentials>) => {
    setValues((current) => ({ ...current, ...patch }))
    setErrors({})
  }

  const credentialsAreValid = () => {
    if (rootInitialized) return true
    const nextErrors = validateSetupCredentials(values)
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const goNext = () => {
    if (currentStep === 1 && !credentialsAreValid()) return
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isLastStep) {
      goNext()
      return
    }
    if (!credentialsAreValid()) {
      setCurrentStep(1)
      return
    }
    mutation.mutate(buildSetupPayload(values, rootInitialized))
  }

  function renderStep(resolved: SetupStatus): ReactNode {
    if (currentStep === 0) return <DatabaseStep status={resolved} />
    if (currentStep === 1) {
      return (
        <AdminStep
          disabled={submitting}
          errors={errors}
          onChange={updateCredentials}
          rootInitialized={rootInitialized}
          values={values}
        />
      )
    }
    if (currentStep === 2) {
      return (
        <UsageModeStep
          disabled={submitting}
          onChange={(usageMode) => setValues((current) => ({ ...current, usageMode }))}
          value={values.usageMode}
        />
      )
    }
    return <ReviewStep status={resolved} values={values} />
  }

  function renderContent(): ReactNode {
    if (isPending) {
      return (
        <Panel>
          <Panel.Body>
            <Skeleton label={t('Checking installation status')} lines={5} />
          </Panel.Body>
        </Panel>
      )
    }

    if (isError || status === undefined) {
      return (
        <Alert
          action={
            <Button
              aria-busy={isFetching}
              disabled={isFetching}
              onClick={() => void refetch()}
              size="sm"
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon />}
          title={t('Installation status could not be read.')}
          tone="destructive"
        >
          {t('The server did not answer /api/setup, so the installer cannot start safely.')}
        </Alert>
      )
    }

    if (status.status) {
      return (
        <Alert icon={<Spinner decorative />} title={t('This deployment is already initialized.')} tone="info">
          {t('Taking you back to the home page.')}
        </Alert>
      )
    }

    return (
      <div className="flex flex-col gap-6">
        <StepIndicator
          currentStep={currentStep}
          label={t('Installation steps')}
          steps={steps}
        />

        <Panel>
          <Panel.Header
            description={steps[currentStep]?.description}
            title={steps[currentStep]?.title ?? ''}
          />
          <form noValidate onSubmit={handleSubmit}>
            <Panel.Body className="flex flex-col gap-5">
              {renderStep(status)}

              {mutation.isError ? (
                <Alert icon={<TriangleAlertIcon />} title={t('Initialization failed.')} tone="destructive">
                  {toErrorMessage(mutation.error)}
                </Alert>
              ) : null}
            </Panel.Body>

            <Panel.Footer align="between">
              <Button
                disabled={currentStep === 0 || submitting}
                onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}
                variant="quiet"
              >
                {t('Back')}
              </Button>

              <Button aria-busy={submitting} disabled={submitting} type="submit">
                {submitting ? <Spinner decorative size="xs" /> : null}
                {isLastStep ? t('Initialize this deployment') : t('Continue')}
              </Button>
            </Panel.Footer>
          </form>
        </Panel>
      </div>
    )
  }

  return (
    <div className="settings-canvas flex min-h-screen flex-col text-foreground">
      <SkipToMain targetId={MAIN_ID} />
      <main
        aria-label={t('Installation')}
        className="mx-auto w-full max-w-[900px] flex-1 px-4 py-12 sm:px-6"
        id={MAIN_ID}
      >
        <div className="mb-8">
          <p className="eyebrow mb-2">{t('First run')}</p>
          <h1 className="text-3xl font-bold leading-tight text-foreground md:text-4xl">
            {t('Set up this deployment')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted md:text-base">
            {t(
              'Four short steps create the administrator account and record how this gateway will be operated.',
            )}
          </p>
        </div>

        {renderContent()}
      </main>
    </div>
  )
}
