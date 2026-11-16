import { useTranslation } from 'react-i18next';

import { useAuditTime } from '../audit/formatTime';
import { CURRENT, INITIAL } from './types';

/** Opis različice: »Izhodiščno stanje«, »Trenutno stanje« ali »Stanje po spremembi ‹čas›«. */
export function useVersionLabel(): (ref: string, createdAt: string | null) => string {
  const { t } = useTranslation();
  const time = useAuditTime();
  return (ref, createdAt) => {
    if (ref === INITIAL) return t('history.version.initial');
    if (ref === CURRENT || createdAt === null) return t('history.version.current');
    return t('history.version.entry', { time: time(createdAt) });
  };
}
