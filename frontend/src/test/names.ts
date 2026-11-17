import { i18n } from '../i18n';
import type { Role } from '../features/groups/types';

// Skupni pomočnik dostopnih imen za FE teste (FR-020-27, R-10): imena glavne navigacije, preklopnika skupin in značk
// vlog se berejo iz prevodov v trenutnem jeziku, da testi ne ponavljajo besedil in jih sprememba imen ne lomi.

const t = i18n.t.bind(i18n);

/** Imena postavk glavne navigacije (Skupine, Arhivirane, Povabila, Račun). */
export const navNames = {
  groups: () => t('groups.heading'),
  archived: () => t('groups.archivedList.link'),
  invitations: () => t('invitations.link.name'),
  /** Povabila z novimi: »Povabila, 1 novo«. */
  invitationsNew: (count: number) => t('invitations.link.nameNew', { count }),
  account: () => t('shell.myAccount'),
};

/** Imena preklopnika skupin (gumb, meni in povezava na vse skupine). */
export const switcherNames = {
  button: () => t('groups.switchGroup'),
  menu: () => t('groups.switchGroup'),
  allGroups: () => t('groups.allGroups'),
};

/** Ime stranskega pasu z mojimi skupinami. */
export const myGroupsNavName = () => t('groups.myGroups');

/** Ime vloge (»Lastnik«). */
export const roleName = (role: Role): string => t(`roles.${role}` as const);

/** Dostopno ime značke vloge (»Vloga: Lastnik«). */
export const roleBadgeName = (role: Role): string =>
  `${t('groups.header.rolePrefix')}${roleName(role)}`;
