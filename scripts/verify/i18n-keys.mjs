// Popolnost prevodov (FR-000-14). Ogrodje – vedenje doda T053.
import { pathToFileURL } from 'node:url';

/**
 * @param {object} sl vsebina sl.json
 * @param {object} en vsebina en.json
 * @returns {Array<{ key: string, missingIn: 'sl' | 'en' }>}
 */
export function compareKeys(sl, en) {
  void sl;
  void en;
  return [];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(0);
}
