/** Datum povabila v zapisu jezika vmesnika (design.md 13): »5. 11. 2026« / »5 Nov 2026«. */
export function formatDate(iso: string, language: string): string {
  const sl = language.startsWith('sl');
  return new Intl.DateTimeFormat(sl ? 'sl' : 'en-GB', {
    day: 'numeric',
    month: sl ? 'numeric' : 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
