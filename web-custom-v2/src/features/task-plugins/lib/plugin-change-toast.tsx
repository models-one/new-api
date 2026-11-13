import { toast } from '@/components/overlay'

import { PricingIssueList } from '../components/PricingIssueList'
import type { PricingIssue } from '../types'

/**
 * Confirms a plugin change. When the serving plugin cannot charge some of its models, the
 * toast lists them instead of reporting plain success: a request for such a model fails
 * until it is priced.
 */
export function toastPluginChange(title: string, issues: readonly PricingIssue[] | null | undefined) {
  if (!issues?.length) {
    toast.success(title)
    return
  }
  toast.warning(title, { description: <PricingIssueList issues={issues} />, duration: 15_000 })
}
