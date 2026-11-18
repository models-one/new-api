/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'

export function ExecutionStatus(props: { status: string }) {
  const { t } = useTranslation()
  let label: string
  switch (props.status) {
    case 'queued':
      label = t('Queued')
      break
    case 'generating':
      label = t('Generating')
      break
    case 'render_pending':
      label = t('Waiting for rendering')
      break
    case 'rendering':
      label = t('Rendering')
      break
    case 'succeeded':
      label = t('Succeeded')
      break
    case 'failed':
      label = t('Failed')
      break
    case 'expired':
      label = t('Expired')
      break
    default:
      label = t('Unknown')
      break
  }
  return <Badge>{label}</Badge>
}
