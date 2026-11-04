// Popolnost prevodov sl/en (FR-000-14): vsak ključ mora obstajati v obeh jezikih.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function flatten(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object' ? flatten(value, full) : [full];
  });
}

/** @returns {{ key: string, missingIn: 'sl' | 'en' }[]} */
export function compareKeys(sl, en) {
  const slKeys = new Set(flatten(sl));
  const enKeys = new Set(flatten(en));
  return [
    ...[...slKeys].filter((key) => !enKeys.has(key)).map((key) => ({ key, missingIn: 'en' })),
    ...[...enKeys].filter((key) => !slKeys.has(key)).map((key) => ({ key, missingIn: 'sl' })),
  ];
}

// CLI: node i18n-keys.mjs [--dir <mapa s sl.json in en.json>]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const index = process.argv.indexOf('--dir');
  const dir = index >= 0 ? path.resolve(process.argv[index + 1]) : path.join(root, 'frontend/src/i18n');
  const read = (language) => JSON.parse(readFileSync(path.join(dir, `${language}.json`), 'utf8'));
  const differences = compareKeys(read('sl'), read('en'));
  for (const { key, missingIn } of differences) console.log(`${key}  manjka v: ${missingIn}`);
  process.exit(differences.length > 0 ? 1 : 0);
}
