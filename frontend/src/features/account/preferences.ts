// Izbira jezika in teme v brskalniku (research R-03, data-model.md) – implementacija v T042.
import type { Language } from '../../i18n/language';

export type { Language };
export type Theme = 'light' | 'dark';

/** Izrecna izbira jezika iz localStorage ali `null` (ni ključa, neznana vrednost, nedostopna shramba). */
export function readStoredLanguage(): Language | null {
  throw new Error('not implemented');
}

/** Izrecna izbira teme iz localStorage ali `null` (Sistemska). */
export function readStoredTheme(): Theme | null {
  throw new Error('not implemented');
}

/** Zapiše (ali ob `null` izbriše) izbiro jezika v localStorage. */
export function storeLanguage(language: Language | null): void {
  throw new Error(`not implemented: ${String(language)}`);
}

/** Uveljavi temo na `<html data-theme>` in jo zapiše; `null` (Sistemska) atribut in ključ odstrani. */
export function applyTheme(theme: Theme | null): void {
  throw new Error(`not implemented: ${String(theme)}`);
}

/** Začetni jezik: shranjena izbira ima prednost, sicer jezik brskalnika (FR-001-16). */
export function initialLanguage(browserLanguage: string): Language {
  throw new Error(`not implemented: ${String(browserLanguage)}`);
}
