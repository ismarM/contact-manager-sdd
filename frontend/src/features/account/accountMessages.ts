import { ApiError } from '../../shared/api/client';
import type { BlockingGroup } from './types';

export type DeletionError =
  { kind: 'mismatch' } | { kind: 'blocked'; groups: BlockingGroup[] } | { kind: 'failed' };

/** Odgovor zaledja na izbris → vrsta napake za vmesnik (FR-012-07: 400 MISMATCH; FR-012-13: 409 OWNS_ACTIVE_GROUPS). */
export function deletionError(error: unknown): DeletionError {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.code === 'OWNS_ACTIVE_GROUPS') {
      const body = error.body as { groups?: BlockingGroup[] } | null;
      return { kind: 'blocked', groups: body?.groups ?? [] };
    }
    if (error.status === 400 && error.code === 'VALIDATION_FAILED') {
      return { kind: 'mismatch' };
    }
  }
  return { kind: 'failed' };
}
