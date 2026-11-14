// FR-000-11: CI požene ista vrata kot lokalno – posle quick, backend in e2e, ki skupaj pokrijejo ./verify.sh full –
// in ob neuspehu priloži .verify/last.log (konstitucija §4.2).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const file = path.resolve(import.meta.dirname, '../../../.github/workflows/ci.yml');
const read = () => {
  assert.ok(existsSync(file), '.github/workflows/ci.yml ne obstaja');
  return readFileSync(file, 'utf8');
};
const levels = ['quick', 'backend', 'e2e'];
/** Besedilo posla: od vrstice "  ime:" do naslednjega posla ali konca datoteke. */
const job = (ci, name) => {
  const start = ci.search(new RegExp(`^ {2}${name}:`, 'm'));
  assert.ok(start >= 0, `manjka posel ${name}`);
  const rest = ci.slice(start + 1);
  const next = rest.search(/^ {2}\w[\w-]*:/m);
  return next >= 0 ? rest.slice(0, next) : rest;
};

describe('CI', () => {
  it('FR-000-11: sproži se ob pushu in pull requestu', () => {
    const ci = read();
    assert.match(ci, /^on:/m);
    assert.match(ci, /\bpush\b/);
    assert.match(ci, /\bpull_request\b/);
  });

  for (const level of levels) {
    it(`FR-000-11: posel ${level} požene ./verify.sh ${level}`, () => {
      assert.match(job(read(), level), new RegExp(`run:\\s*\\./verify\\.sh ${level}\\s*$`, 'm'));
    });

    it(`FR-000-11: posel ${level} ob neuspehu priloži .verify/last.log`, () => {
      const text = job(read(), level);
      assert.ok(text.includes('actions/upload-artifact'), 'manjka actions/upload-artifact');
      assert.match(text, /if:\s*(\$\{\{\s*)?failure\(\)/);
      assert.match(text.slice(text.indexOf('actions/upload-artifact')), /\.verify\/last\.log/);
    });
  }

  it('FR-000-11: CI ne poganja drugih ravni kot quick, backend in e2e', () => {
    const run = [...read().matchAll(/run:\s*\.\/verify\.sh (\S+)/g)].map((m) => m[1]);
    assert.deepEqual(run.sort(), [...levels].sort());
  });
});
