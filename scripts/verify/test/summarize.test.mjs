// FR-000-08: zgoščen izpis verify.sh (contracts/verify-cli.md – Izpis).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { summarize } from '../summarize.mjs';

const fixture = (name) => readFileSync(path.join(import.meta.dirname, 'fixtures/summarize', name), 'utf8');
const options = { root: '/repo', limit: 19 };

describe('summarize – oblike izpisa orodij', () => {
  it('FR-000-08: ESLint (unix) → korak, datoteka:vrstica, pravilo, sporočilo', () => {
    const lines = summarize([{ name: 'lint', kind: 'eslint', cwd: 'frontend', output: fixture('eslint-unix.txt') }], options);
    assert.deepEqual(lines, [
      'lint  frontend/src/app/App.tsx:3  @typescript-eslint/no-explicit-any  Unexpected any. Specify a different type.',
      'lint  frontend/src/app/StartPage.tsx:10  jsx-a11y/alt-text  img elements must have an alt prop, either with meaningful text, or an empty string for decorative images.',
    ]);
  });

  it('FR-000-08: tsc → poti relativno na koren repozitorija', () => {
    const lines = summarize([{ name: 'tipi', kind: 'tsc', cwd: 'frontend', output: fixture('tsc.txt') }], options);
    assert.deepEqual(lines, ["tipi  frontend/src/i18n/index.ts:12  TS2322  Type 'number' is not assignable to type 'string'."]);
  });

  it('FR-000-08: javac – opozorilo je napaka, pravilo je kategorija lint', () => {
    const lines = summarize([{ name: 'tipi', kind: 'maven', cwd: 'backend', output: fixture('maven.txt') }], options);
    assert.deepEqual(lines, [
      'tipi  backend/src/main/java/si/contactmanager/Old.java:7  deprecation  legacy() in Api has been deprecated',
      'tipi  backend/src/main/java/si/contactmanager/Broken.java:12  javac  cannot find symbol',
    ]);
  });

  it('FR-000-08: Spotless → seznam neformatiranih datotek', () => {
    const lines = summarize([{ name: 'format', kind: 'spotless', cwd: 'backend', output: fixture('spotless.txt') }], options);
    assert.deepEqual(lines, [
      'format  backend/src/main/java/si/contactmanager/ContactManagerApplication.java  spotless  datoteka ni formatirana',
      'format  backend/src/test/java/si/contactmanager/HealthAndMigrationIT.java  spotless  datoteka ni formatirana',
    ]);
  });

  it('FR-000-08: Prettier → seznam neformatiranih datotek brez povzetka', () => {
    const lines = summarize([{ name: 'format', kind: 'prettier', cwd: 'frontend', output: fixture('prettier.txt') }], options);
    assert.deepEqual(lines, [
      'format  frontend/src/app/App.tsx  prettier  datoteka ni formatirana',
      'format  frontend/src/i18n/index.ts  prettier  datoteka ni formatirana',
    ]);
  });

  it('FR-000-08: JUnit XML (Surefire) → ime padlega testa in prva vrstica razloga', () => {
    const lines = summarize([{ name: 'unit BE', kind: 'junit', output: '', reports: [fixture('surefire.xml')] }], options);
    assert.deepEqual(lines, ['unit BE  RequestIdFilterTest › keepsValidIncomingRequestId  expected: "nginx-1"']);
  });

  it('FR-000-08: JUnit XML (Playwright) → ime projekta (širina) v oglatih oklepajih', () => {
    const lines = summarize([{ name: 'E2E', kind: 'junit', output: '', reports: [fixture('playwright.xml')] }], options);
    assert.deepEqual(lines, [
      'E2E  [w768] shema dark › FR-000-13: shema sledi sistemu, data-theme jo preglasi  ogrodje.spec.ts:60:5 FR-000-13',
    ]);
  });

  it('FR-000-08: neprepoznan izpis → zadnje neprazne vrstice koraka', () => {
    const output = Array.from({ length: 30 }, (_, i) => `vrstica ${i + 1}`).join('\n') + '\n\n';
    const lines = summarize([{ name: 'sistem', kind: 'generic', output }], { root: '/repo', limit: 5 });
    assert.deepEqual(lines, ['sistem  vrstica 26', 'sistem  vrstica 27', 'sistem  vrstica 28', 'sistem  vrstica 29', 'sistem  vrstica 30']);
  });
});

describe('summarize – omejitev vrstic', () => {
  it('FR-000-08: več napak, kot je prostora → zadnja vrstica pove število neprikazanih', () => {
    const output = Array.from(
      { length: 30 },
      (_, i) => `/repo/frontend/src/f${i}.ts:1:1: Unexpected any. [Error/@typescript-eslint/no-explicit-any]`,
    ).join('\n');
    const lines = summarize([{ name: 'lint', kind: 'eslint', cwd: 'frontend', output }], options);

    assert.equal(lines.length, 19);
    assert.match(lines[17], /^lint {2}frontend\/src\/f17\.ts:1 /);
    assert.equal(lines[18], '… in še 12 (celoten izpis: .verify/last.log)');
  });

  it('FR-000-08: napake več korakov so v vrstnem redu korakov', () => {
    const lines = summarize(
      [
        { name: 'format', kind: 'prettier', cwd: 'frontend', output: fixture('prettier.txt') },
        { name: 'tipi', kind: 'tsc', cwd: 'frontend', output: fixture('tsc.txt') },
      ],
      options,
    );
    assert.deepEqual(
      lines.map((l) => l.split('  ')[0]),
      ['format', 'format', 'tipi'],
    );
  });
});
