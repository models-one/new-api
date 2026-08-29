import DatabaseIcon from 'lucide-react/dist/esm/icons/database'
import HardDriveIcon from 'lucide-react/dist/esm/icons/hard-drive'
import { useTranslation } from 'react-i18next'

import { Alert } from '@/components/ui/Alert'
import { DescriptionList } from '@/components/ui/DescriptionList'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { Tone } from '@/components/ui/tone'
import type { SetupStatus } from '@/features/setup/api'

type DatabaseStepProps = {
  status: SetupStatus
}

/**
 * `common.MainDatabaseType()` only ever reports one of these three (common/database.go).
 * Anything else is echoed verbatim rather than described, because the console has nothing
 * true to say about a driver it does not know.
 */
const knownDatabases: Record<string, { label: string; tone: Tone }> = {
  mysql: { label: 'MySQL', tone: 'success' },
  postgres: { label: 'PostgreSQL', tone: 'success' },
  sqlite: { label: 'SQLite', tone: 'warning' },
}

export function DatabaseStep(props: DatabaseStepProps) {
  const { t } = useTranslation()
  const reported = props.status.database_type
  const known = knownDatabases[reported.toLowerCase()]

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-6 text-muted">
        {t('The installer uses the database this server was started with. Nothing is changed here.')}
      </p>

      <DescriptionList
        items={[
          {
            description: known ? (
              <StatusBadge tone={known.tone}>{known.label}</StatusBadge>
            ) : (
              <span className="mono text-sm">{reported === '' ? t('Unknown') : reported}</span>
            ),
            id: 'database',
            term: t('Detected database'),
          },
          {
            description: (
              <StatusBadge tone={props.status.root_init ? 'info' : 'muted'}>
                {props.status.root_init ? t('Already created') : t('Not created yet')}
              </StatusBadge>
            ),
            id: 'root',
            term: t('Administrator account'),
          },
        ]}
        label={t('Detected server configuration')}
      />

      {reported.toLowerCase() === 'sqlite' ? (
        <Alert icon={<HardDriveIcon />} title={t('Make sure the SQLite file is persisted')} tone="warning">
          {t(
            'SQLite keeps everything in a single file. In a container or any ephemeral environment, map that file to persistent storage or the deployment loses its data on restart.',
          )}
        </Alert>
      ) : null}

      {reported === '' ? (
        <Alert icon={<DatabaseIcon />} title={t('The server did not report a database driver.')} tone="info">
          {t('Installation can still continue; the server uses whatever it was configured with.')}
        </Alert>
      ) : null}
    </div>
  )
}
