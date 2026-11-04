// FR-000-11: CI požene ./verify.sh full in ob neuspehu priloži .verify/last.log (research R-13).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const file = path.resolve(import.meta.dirname, '../../../.github/workflows/ci.yml');
const read = () => {
  assert.ok(existsSync(file), '.github/workflows/ci.yml ne obstaja');
  return readFileSync(file, 'utf8');
};

describe('CI', () => {
  it('FR-000-11: sproži se ob pushu in pull requestu', () => {
    const ci = read();
    assert.match(ci, /^on:/m);
    assert.match(ci, /\bpush\b/);
    assert.match(ci, /\bpull_request\b/);
  });

  it('FR-000-11: posel verify požene ./verify.sh full', () => {
    const ci = read();
    assert.match(ci, /^ {2}verify:/m);
    assert.match(ci, /run:\s*\.\/verify\.sh full/);
  });

  it('FR-000-11: ob neuspehu priloži .verify/last.log', () => {
    const ci = read();
    const upload = ci.slice(ci.indexOf('actions/upload-artifact'));
    assert.ok(ci.includes('actions/upload-artifact'), 'manjka actions/upload-artifact');
    assert.match(ci, /if:\s*(\$\{\{\s*)?failure\(\)/);
    assert.match(upload, /\.verify\/last\.log/);
  });
});
