import { useQuery } from '@tanstack/react-query'

import {
  deploymentSettingsQuery,
  testDeploymentConnection,
  type DeploymentConnection,
  type DeploymentSettings,
} from '@/features/deployments/api'

/**
 * The io.net integration is gated TWICE, and the two gates fail for different reasons and
 * are fixed in different places:
 *
 *   1. The feature flag. `getIoAPIKey` refuses every data route unless
 *      `model_deployment.ionet.enabled` is "true" AND `model_deployment.ionet.api_key` is
 *      non-empty. `GET /api/deployments/settings` reports both as `enabled` and
 *      `configured`; it is the only route that answers while the gate is shut.
 *
 *   2. The live connection. A stored key is not a working key. `POST
 *      /api/deployments/settings/test-connection` calls io.net's
 *      `/hardware/max-gpus-per-container` with it and reports the upstream's own message
 *      on failure — verified on this instance:
 *      "failed to get max GPUs per container: Invalid API key provided!".
 *
 * `can_connect` in the settings payload is only `enabled && configured` computed in Go.
 * It is a claim about configuration, never about reachability, so gate 2 always runs.
 */
export type DeploymentIntegration =
  /** Gate 1 or gate 2 is still in flight. */
  | { kind: 'checking'; step: 'settings' | 'connection' }
  /** `GET /api/deployments/settings` itself failed — the gates are unknown, not shut. */
  | { kind: 'settings-error'; error: unknown }
  /** Gate 1: the operator has not switched the provider on. */
  | { kind: 'disabled'; settings: DeploymentSettings }
  /** Gate 1: switched on, but no API key is stored. */
  | { kind: 'unconfigured'; settings: DeploymentSettings }
  /** Gate 2: the stored key was rejected, or io.net could not be reached. */
  | { kind: 'unreachable'; settings: DeploymentSettings; error: unknown }
  /** Both gates open. `connection` is what io.net just reported about the account. */
  | { kind: 'ready'; settings: DeploymentSettings; connection: DeploymentConnection }

export type DeploymentIntegrationResult = {
  state: DeploymentIntegration
  /** True while either gate is being re-checked, for aria-busy on the retry control. */
  isRechecking: boolean
  /** Re-runs gate 1 and, when it opens, gate 2. */
  recheck: () => void
}

export function useDeploymentIntegration(enabled: boolean): DeploymentIntegrationResult {
  const settingsQuery = useQuery({ ...deploymentSettingsQuery(), enabled })
  const settings = settingsQuery.data

  const gateOneOpen = settings !== undefined && settings.enabled && settings.configured

  const connectionQuery = useQuery({
    enabled: enabled && gateOneOpen,
    /**
     * A rejected key is a stable answer, not a flake: retrying it four times only delays
     * the guard panel the operator needs to read.
     */
    retry: false,
    queryKey: ['deployments', 'connection'] as const,
    queryFn: testDeploymentConnection,
    staleTime: 60 * 1000,
  })

  const state = ((): DeploymentIntegration => {
    if (settingsQuery.isError) return { error: settingsQuery.error, kind: 'settings-error' }
    if (settings === undefined) return { kind: 'checking', step: 'settings' }
    if (!settings.enabled) return { kind: 'disabled', settings }
    if (!settings.configured) return { kind: 'unconfigured', settings }
    if (connectionQuery.isError) {
      return { error: connectionQuery.error, kind: 'unreachable', settings }
    }
    if (connectionQuery.data === undefined) return { kind: 'checking', step: 'connection' }
    return { connection: connectionQuery.data, kind: 'ready', settings }
  })()

  return {
    isRechecking: settingsQuery.isFetching || connectionQuery.isFetching,
    recheck: () => {
      void settingsQuery.refetch()
      void connectionQuery.refetch()
    },
    state,
  }
}
