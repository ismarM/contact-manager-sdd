import { ApiError } from '../../shared/api/client';

// Preslikava napak API-ja v ključe sporočil (design.md 8.13): uporabnik nikoli ne vidi tehničnih kod.

export type MemberAction = 'change' | 'remove' | 'leave' | 'transfer';

export interface MemberFailure {
  /** Ključ sporočila v `members.errors`. */
  key: string;
  /** Strežnik je stanje spremenil pod nami: ponovno preberi seznam članov in skupino. */
  stale: boolean;
}

const FAILED_KEY: Record<MemberAction, string> = {
  change: 'members.errors.changeFailed',
  remove: 'members.errors.removeFailed',
  leave: 'members.errors.leaveFailed',
  transfer: 'members.errors.transferFailed',
};

/** Šifre strežniških 409 napak v ključe sporočil. */
export const MEMBER_ERROR_KEYS: Record<string, string> = {
  OWNER_CANNOT_LEAVE: 'members.errors.ownerCannotLeave',
  LAST_MEMBER_CANNOT_LEAVE: 'members.errors.lastMemberCannotLeave',
  TARGET_NOT_MEMBER: 'members.errors.targetNotMember',
};

export function memberFailure(error: unknown, action: MemberAction): MemberFailure {
  if (!(error instanceof ApiError)) return { key: 'members.errors.offline', stale: false };
  const onMember = action === 'change' || action === 'remove';
  if (error.status === 403) {
    return {
      key: onMember ? 'members.errors.cannotManage' : 'members.errors.forbidden',
      stale: true,
    };
  }
  if (error.status === 404) {
    return { key: onMember ? 'members.errors.memberGone' : FAILED_KEY[action], stale: true };
  }
  if (error.status === 409) {
    if (error.code === 'GROUP_ARCHIVED') {
      return {
        key: action === 'transfer' ? 'members.errors.transferArchived' : 'members.errors.archived',
        stale: true,
      };
    }
    const key = MEMBER_ERROR_KEYS[error.code];
    if (key) return { key, stale: error.code === 'TARGET_NOT_MEMBER' };
  }
  return { key: FAILED_KEY[action], stale: false };
}
