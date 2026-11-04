// FR-000-14: popolnost prevodov sl/en.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { compareKeys } from '../i18n-keys.mjs';

describe('i18n-keys', () => {
  it('FR-000-14: enaki gnezdeni ključi nimajo razlik', () => {
    const sl = { app: { name: 'Kontakti' }, start: { ready: 'x' } };
    const en = { app: { name: 'Contacts' }, start: { ready: 'y' } };
    assert.deepEqual(compareKeys(sl, en), []);
  });

  it('FR-000-14: ključ samo v sl manjka v en', () => {
    assert.deepEqual(compareKeys({ a: { b: 'x' }, c: 'x' }, { c: 'y' }), [{ key: 'a.b', missingIn: 'en' }]);
  });

  it('FR-000-14: ključ samo v en manjka v sl', () => {
    assert.deepEqual(compareKeys({ c: 'x' }, { c: 'y', d: { e: 'z' } }), [{ key: 'd.e', missingIn: 'sl' }]);
  });

  it('FR-000-14: CLI vrne 1 in izpiše manjkajoči ključ in jezik', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cm-i18n-'));
    writeFileSync(path.join(dir, 'sl.json'), JSON.stringify({ app: { name: 'Kontakti' }, only: { sl: 'x' } }));
    writeFileSync(path.join(dir, 'en.json'), JSON.stringify({ app: { name: 'Contacts' } }));

    const result = spawnSync('node', [path.join(import.meta.dirname, '../i18n-keys.mjs'), '--dir', dir], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /^only\.sl {2}manjka v: en$/m);
  });

  it('FR-000-14: CLI vrne 0 ob popolnih prevodih', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cm-i18n-'));
    writeFileSync(path.join(dir, 'sl.json'), JSON.stringify({ a: 'x' }));
    writeFileSync(path.join(dir, 'en.json'), JSON.stringify({ a: 'y' }));

    const result = spawnSync('node', [path.join(import.meta.dirname, '../i18n-keys.mjs'), '--dir', dir], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
  });
});
