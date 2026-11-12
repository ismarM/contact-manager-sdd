import { localDateStamp } from '../../../shared/download';

/**
 * Naslov skupine v delu imena datoteke (010, FR-010-10; research R-03): brez diakritičnih znakov, vsako zaporedje znakov
 * razen črk, številk, `.` in `_` postane `-`, vodilni in končni `-` ter `.` se odrežejo; prazno → `skupina` / `group`.
 */
export function fileNameTitle(title: string, language: 'sl' | 'en'): string {
  const name = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9._]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (name !== '') return name;
  return language === 'sl' ? 'skupina' : 'group';
}

/** `‹naslov›-kontakti-YYYY-MM-DD.xlsx` (sl) oziroma `‹naslov›-contacts-YYYY-MM-DD.xlsx` (en); datum je lokalni. */
export function exportFileName(title: string, language: 'sl' | 'en', now: Date): string {
  const word = language === 'sl' ? 'kontakti' : 'contacts';
  return `${fileNameTitle(title, language)}-${word}-${localDateStamp(now)}.xlsx`;
}
