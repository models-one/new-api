import ServerIcon from 'lucide-react/dist/esm/icons/server'

import {
  AlertsSection,
  EmailSection,
  LogsSection,
  PerformanceSection,
  UpdateCheckerSection,
  WorkerSection,
} from '@/features/system-settings/models-operations'
import { BehaviorSection } from '@/features/system-settings/sections/operations/BehaviorSection'
import type { SettingsGroupDefinition } from '@/features/system-settings/groups/types'

/**
 * OWNER: the agent rebuilding the Operations group.
 *
 * Section ids mirror `web/src/features/system-settings/operations/section-registry.tsx`.
 *
 * `SMTPToken` and `WorkerValidKey` are stripped from the read payload as secrets, so the
 * SMTP and Worker sections must use write-only PasswordInputs. `update-checker` is not an
 * option section at all in the legacy console — it reads the running version and start
 * time, so it needs `/api/status`, not the option store.
 */
export const operationsGroup: SettingsGroupDefinition = {
  Icon: ServerIcon,
  description: 'How the deployment runs: behaviour flags, mail, workers, logs and performance.',
  id: 'operations',
  sections: [
    {
      Component: BehaviorSection,
      description: 'Deployment-wide flags that change how the console and the gateway behave.',
      id: 'behavior',
      title: 'System behaviour',
    },
    {
      Component: AlertsSection,
      description: 'Balance reminders and the performance metrics collector.',
      id: 'alerts',
      title: 'Monitoring and alerts',
    },
    {
      Component: EmailSection,
      description: 'The mail server used for verification and password resets.',
      id: 'email',
      title: 'SMTP e-mail',
    },
    {
      Component: WorkerSection,
      description: 'The image relay used for upstream media.',
      id: 'worker',
      title: 'Worker proxy',
    },
    {
      Component: LogsSection,
      description: 'Consumption logging and log cleanup.',
      id: 'logs',
      title: 'Log maintenance',
    },
    {
      Component: PerformanceSection,
      description: 'Body cache and the host resource monitor.',
      id: 'performance',
      title: 'Performance',
    },
    {
      Component: UpdateCheckerSection,
      description: 'The running version and uptime of this deployment.',
      id: 'update-checker',
      title: 'System maintenance',
    },
  ],
  title: 'Operations',
}
