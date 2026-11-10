import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { secondaryButton, warningAlert } from '../../shared/ui/styles';
import { useListLanguage } from '../groups/api';
import type { Member } from './types';

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Opozorilo o konfliktu verzij pri spremembi vloge (design.md 8.14; FR-007-04): kdo in kdaj je vlogo medtem spremenil
 * ter *Uporabi trenutno različico* in *Shrani moje spremembe*. Nič se ne prepiše tiho.
 */
export function MemberConflictAlert({
  current,
  onUseCurrent,
  onSaveMine,
}: {
  current: Member;
  onUseCurrent: () => void;
  onSaveMine: () => void;
}) {
  const { t } = useTranslation();
  const language = useListLanguage();
  const changed = current.updatedAt ? new Date(current.updatedAt) : new Date();
  const clock = new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(
    changed,
  );
  const time = sameDay(changed, new Date())
    ? clock
    : `${new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(changed)} ${clock}`;
  const name = current.updatedBy
    ? (current.updatedBy.name ?? current.updatedBy.email)
    : t('members.changeRole.deletedUser');

  return (
    <div role="alert" className={warningAlert}>
      <p className="flex gap-2">
        <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="mt-0.5 shrink-0" />
        <span>{t('members.changeRole.conflict', { name, time })}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} onClick={onUseCurrent}>
          {t('members.changeRole.useCurrent')}
        </button>
        <button type="button" className={secondaryButton} onClick={onSaveMine}>
          {t('members.changeRole.saveMine')}
        </button>
      </div>
    </div>
  );
}
