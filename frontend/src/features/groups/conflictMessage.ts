import { i18n } from '../../i18n';
import type { UserRef } from './types';

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Besedilo opozorila o konfliktu verzij (design.md 8.14, FR-002-12): kdo (ime, sicer e-naslov; `null` = izbrisan
 * uporabnik, feature-map §2.5) in kdaj (ura v zapisu jezika; datum, če sprememba ni bila na isti dan kot `now`).
 */
export function conflictMessage(
  updatedBy: UserRef | null,
  updatedAt: string,
  language: 'sl' | 'en',
  now: Date,
): string {
  const t = i18n.getFixedT(language);
  const changed = new Date(updatedAt);
  const clock = new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(
    changed,
  );
  const time = sameDay(changed, now)
    ? clock
    : `${new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(changed)} ${clock}`;
  const who = updatedBy ? (updatedBy.name ?? updatedBy.email) : t('groups.conflict.deletedUser');
  return t('groups.conflict.message', { who, time });
}
