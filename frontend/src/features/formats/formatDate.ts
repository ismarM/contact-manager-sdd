import type { DateFormat, UiLanguage } from './types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Prikaz datuma po shemi (FR-016-16): *Po jeziku vmesnika* »16. 11. 2026« / »16/11/2026«, *ISO 8601* »2026-11-16«,
 * *Dolga oblika* »16. november 2026« / »16 November 2026«. Vrednost, ki ni veljaven datum `uuuu-MM-dd`, ostane
 * kanonična. Datum je koledarski (brez časovnega pasu).
 */
export function formatDate(value: string, format: DateFormat | null, language: UiLanguage): string {
  const match = ISO_DATE.exec(value);
  if (!match || format === 'ISO') return value;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value;
  }
  const locale = language === 'sl' ? 'sl' : 'en-GB';
  const options: Intl.DateTimeFormatOptions =
    format === 'LONG'
      ? { dateStyle: 'long', timeZone: 'UTC' }
      : { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale, options).format(date);
}
