import { useTranslation } from 'react-i18next'

import type { ValidationCode } from '@/features/system-settings/auth-security/validation'

/**
 * The sentences for `validation.ts`'s message codes.
 *
 * The validators stay pure and return codes so they can be tested without an i18n
 * instance; this hook is the one place those codes become text, shared by the rate-limit
 * and SSRF sections rather than written out twice.
 */
export function useValidationMessages(): Record<ValidationCode, string> {
  const { t } = useTranslation()

  return {
    'bad-cidr': t('Enter an IP address or a CIDR block, one per line.'),
    'bad-domain': t('Enter a bare domain such as example.com or *.example.com — no scheme, port or path.'),
    'bad-limit-shape': t('Each group maps to exactly two whole numbers: [total requests, successful requests].'),
    'bad-port': t('Ports must be whole numbers between 1 and 65535.'),
    'bad-port-range': t('A range looks like 8000-9000, with both ends between 1 and 65535 and the start no higher than the end.'),
    'invalid-json': t('This is not valid JSON.'),
    'limit-too-large': t('A limit cannot exceed 2147483647.'),
    'negative-total': t('The total request limit cannot be negative.'),
    'not-an-object': t('Use a JSON object keyed by group name.'),
    'success-below-one': t('The successful request limit must be at least 1.'),
  }
}
