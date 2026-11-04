// Varna ciljna pot po prijavi (FR-001-06, research R-05): samo pot znotraj aplikacije, nikoli tuj izvor.
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/')) return '/';
  // »//host« in »/\host« brskalnik razume kot drug izvor.
  if (next.startsWith('//') || next.startsWith('/\\')) return '/';
  // Vrnitev na stran za prijavo bi ustvarila zanko.
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login#')) return '/';
  return next;
}
