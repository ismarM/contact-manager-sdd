export type Language = 'sl' | 'en';

/** Jezik brskalnika, ki se začne s »sl« (ne glede na velikost črk), izbere slovenščino, sicer angleščino (FR-000-14). */
export function detectLanguage(browserLanguage: string): Language {
  return browserLanguage.toLowerCase().startsWith('sl') ? 'sl' : 'en';
}
