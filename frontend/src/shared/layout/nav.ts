import { IconArchive, IconMail, IconUser, IconUsers } from '@tabler/icons-react';

/** Postavke glavne navigacije (FR-020-05, -07). */
export type NavKey = 'groups' | 'archived' | 'invitations' | 'account';

export const NAV_PATH: Record<NavKey, string> = {
  groups: '/',
  archived: '/groups/archived',
  invitations: '/invitations',
  account: '/account',
};

export const NAV_ICON = {
  groups: IconUsers,
  archived: IconArchive,
  invitations: IconMail,
  account: IconUser,
};

/** Aktivna postavka za pot; znotraj skupine ni nobena (označena je kartica skupine). */
export function activeNav(pathname: string): NavKey | null {
  if (pathname === '/' || pathname === '/groups') return 'groups';
  if (pathname === '/groups/archived') return 'archived';
  if (pathname === '/invitations') return 'invitations';
  if (pathname === '/account' || pathname.startsWith('/account/')) return 'account';
  return null;
}
