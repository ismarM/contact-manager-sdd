import { useTranslation } from 'react-i18next';

import { useListLanguage } from '../groups/api';
import type { UserRef } from '../groups/types';

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Besedilo opozorila o konfliktu kontakta (design.md 8.14, FR-004-11; pravilo kot 002): kdo (ime, sicer e-naslov;
 * `null` = izbrisan uporabnik) in kdaj (ura v zapisu jezika, pred njo datum, če sprememba ni bila danes).
 */
export function useConflictMessage(): (updatedBy: UserRef | null, updatedAt: string) => string {
  const { t } = useTranslation();
  const language = useListLanguage();
  return (updatedBy, updatedAt) => {
    const changed = new Date(updatedAt);
    const clock = new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(
      changed,
    );
    const time = sameDay(changed, new Date())
      ? clock
      : `${new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(changed)} ${clock}`;
    const who = updatedBy
      ? (updatedBy.name ?? updatedBy.email)
      : t('contacts.conflict.deletedUser');
    return t('contacts.conflict.message', { who, time });
  };
}
