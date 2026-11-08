import { IconMail } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { focusRing } from '../../shared/ui/styles';
import { useInvitations } from './invitationsContext';

/**
 * Povezava *Povabila* v zgornji vrstici (design.md 7.1; FR-006-06): vidno »Povabila (3)«, pod 640 px ikona in število;
 * dostopno ime z množinsko obliko, `aria-current="page"` na `/invitations`.
 */
export function InvitationsLink() {
  const { t } = useTranslation();
  const { count } = useInvitations();
  const name = count > 0 ? t('invitations.link.nameNew', { count }) : t('invitations.link.name');

  return (
    <NavLink
      to="/invitations"
      aria-label={name}
      className={`flex h-11 items-center rounded-md px-3 font-bold text-foreground hover:bg-muted pointer-coarse:h-12 ${focusRing}`}
    >
      <IconMail aria-hidden="true" size={20} stroke={1.75} className="mr-1 sm:hidden" />
      <span className="max-sm:hidden">{t('invitations.link.text')}</span>
      {count > 0 && <span>{` (${count})`}</span>}
    </NavLink>
  );
}
