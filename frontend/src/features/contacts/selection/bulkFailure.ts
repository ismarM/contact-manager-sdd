import type { TFunction } from 'i18next';

import { ApiError } from '../../../shared/api/client';

/** Neuspeh množične operacije brez tehničnih kod (FR-009-17; design.md 8.13); omrežna napaka dobi *Poskusi znova*. */
export function bulkFailure(
  error: unknown,
  t: TFunction,
  fallback: 'contacts.bulk.failed' | 'contacts.bulk.deleteFailed',
): { text: string; retry: boolean } {
  if (!(error instanceof ApiError)) return { text: t('contacts.bulk.network'), retry: true };
  if (error.status === 403) return { text: t('contacts.bulk.forbidden'), retry: false };
  if (error.status === 409 && error.code === 'GROUP_ARCHIVED') {
    return { text: t('contacts.bulk.archived'), retry: false };
  }
  return { text: t(fallback), retry: false };
}
