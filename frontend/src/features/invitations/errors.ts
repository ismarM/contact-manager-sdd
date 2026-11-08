import { ApiError } from '../../shared/api/client';

/** Vrsta neuspeha akcije nad povabilom (design.md 8.13): brez tehničnih kod; omrežna napaka = brez povezave. */
export type Failure =
  'unavailable' | 'alreadyMember' | 'forbidden' | 'archived' | 'failed' | 'offline';

export function classify(error: unknown): Failure {
  if (!(error instanceof ApiError)) return 'offline';
  if (error.status === 404) return 'unavailable';
  if (error.status === 403) return 'forbidden';
  if (error.status === 409 && error.code === 'ALREADY_MEMBER') return 'alreadyMember';
  if (error.status === 409 && error.code === 'GROUP_ARCHIVED') return 'archived';
  return 'failed';
}
