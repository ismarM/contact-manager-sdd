// Preverjanje utišanj (FR-000-18). Ogrodje – vedenje doda T058.
import { pathToFileURL } from 'node:url';

/**
 * @param {Array<{ path: string, content: string }>} files
 * @param {string} decisionsMd vsebina DECISIONS.md
 * @returns {Array<{ file: string, line: number, kind: string, message: string }>}
 */
export function findSuppressions(files, decisionsMd) {
  void files;
  void decisionsMd;
  return [];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(0);
}
