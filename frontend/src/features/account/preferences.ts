// Izbira jezika in teme v brskalniku (research R-03, data-model.md). Branje in pisanje sta zaščitena, ker je
// localStorage v zasebnem načinu lahko nedostopen – izbira tedaj velja do zaprtja strani.
import { detectLanguage, type Language } from '../../i18n/language';

export type { Language };
export type Theme = 'light' | 'dark';

const LANGUAGE_KEY = 'language';
const THEME_KEY = 'theme';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // shramba ni dostopna
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // shramba ni dostopna: izbira velja samo do zaprtja strani
  }
}

function isLanguage(value: string | null): value is Language {
  return value === 'sl' || value === 'en';
}

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

/** Izrecna izbira jezika iz localStorage ali `null` (ni ključa, neznana vrednost, nedostopna shramba). */
export function readStoredLanguage(): Language | null {
  const value = read(LANGUAGE_KEY);
  return isLanguage(value) ? value : null;
}

/** Izrecna izbira teme iz localStorage ali `null` (Sistemska). */
export function readStoredTheme(): Theme | null {
  const value = read(THEME_KEY);
  return isTheme(value) ? value : null;
}

/** Zapiše (ali ob `null` izbriše) izbiro jezika v localStorage. */
export function storeLanguage(language: Language | null): void {
  write(LANGUAGE_KEY, language);
}

/** Uveljavi temo na `<html data-theme>` in jo zapiše; `null` (Sistemska) atribut in ključ odstrani (design.md 4.3). */
export function applyTheme(theme: Theme | null): void {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  write(THEME_KEY, theme);
}

/** Začetni jezik: shranjena izbira ima prednost, sicer jezik brskalnika (FR-001-16). */
export function initialLanguage(browserLanguage: string): Language {
  return readStoredLanguage() ?? detectLanguage(browserLanguage);
}
