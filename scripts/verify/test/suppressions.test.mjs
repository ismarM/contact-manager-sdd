// FR-000-18: preverjanje utišanj, izklopljenih in osredotočenih testov (contracts/verify-cli.md).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findSuppressions } from '../suppressions.mjs';

const here = import.meta.dirname;
const decisions = readFileSync(path.join(here, 'fixtures/suppressions/DECISIONS.md'), 'utf8');

const check = (file, content) => findSuppressions([{ path: file, content }], decisions);
const kinds = (findings) => findings.map((f) => f.kind);

describe('suppressions – brez sklica je napaka', () => {
  const cases = [
    ['frontend/src/a.ts', '// eslint-disable-next-line no-console\nconsole.log(1);\n', 'eslint-disable', 1],
    ['frontend/src/a.ts', '/* eslint-disable */\nexport const a = 1;\n', 'eslint-disable', 1],
    ['frontend/src/a.ts', '// @ts-ignore\nexport const a: string = 1;\n', '@ts-ignore', 1],
    ['frontend/src/a.ts', '// @ts-expect-error\nexport const a: string = 1;\n', '@ts-expect-error', 1],
    ['frontend/src/a.ts', 'export const a = 1;\nexport let b: any = 1;\n', 'any', 2],
    ['frontend/src/a.ts', 'export function f(x: Array<any>) { return x; }\n', 'any', 1],
    ['frontend/src/a.test.ts', "it.skip('x', () => {});\n", '.skip', 1],
    ['frontend/src/a.test.ts', "describe.skip('x', () => {});\n", '.skip', 1],
    ['e2e/tests/a.spec.ts', "test.fixme('x', async () => {});\n", '.fixme', 1],
    ['frontend/src/a.test.ts', "xit('x', () => {});\n", 'xit', 1],
    ['frontend/src/a.test.ts', "xdescribe('x', () => {});\n", 'xdescribe', 1],
    ['frontend/src/a.test.ts', "xtest('x', () => {});\n", 'xtest', 1],
    ['backend/src/main/java/A.java', '@SuppressWarnings("unchecked")\nclass A {}\n', '@SuppressWarnings', 1],
    ['backend/src/test/java/ATest.java', 'class ATest {\n  @Disabled\n  void t() {}\n}\n', '@Disabled', 2],
    ['backend/src/test/java/ATest.java', 'class ATest {\n  @DisabledOnOs(OS.LINUX)\n  void t() {}\n}\n', '@Disabled', 2],
  ];

  for (const [file, content, kind, line] of cases) {
    it(`FR-000-18: ${kind} brez sklica v ${file}:${line}`, () => {
      const findings = check(file, content);
      assert.equal(findings.length, 1, JSON.stringify(findings));
      assert.equal(findings[0].kind, kind);
      assert.equal(findings[0].file, file);
      assert.equal(findings[0].line, line);
      assert.match(findings[0].message, /manjka sklic DECISIONS D-NN/);
    });
  }
});

describe('suppressions – veljaven sklic', () => {
  it('FR-000-18: sklic v predhodni vrstici na vnos vrste utišanje je dovoljen', () => {
    const content = '// DECISIONS D-02: razlog\n// eslint-disable-next-line no-console\nconsole.log(1);\n';
    assert.deepEqual(check('frontend/src/a.ts', content), []);
  });

  it('FR-000-18: sklic v isti vrstici je dovoljen', () => {
    const content = 'export let b: any = 1; // DECISIONS D-02: razlog\n';
    assert.deepEqual(check('frontend/src/a.ts', content), []);
  });

  it('FR-000-18: izklopljen test s sklicem je dovoljen', () => {
    const content = "// DECISIONS D-02: razlog\nit.skip('x', () => {});\n";
    assert.deepEqual(check('frontend/src/a.test.ts', content), []);
  });

  it('FR-000-18: @Disabled s sklicem je dovoljen', () => {
    const content = 'class ATest {\n  // DECISIONS D-02: razlog\n  @Disabled\n  void t() {}\n}\n';
    assert.deepEqual(check('backend/src/test/java/ATest.java', content), []);
  });
});

describe('suppressions – neveljaven sklic in .only', () => {
  it('FR-000-18: sklic na vnos druge vrste je neveljaven', () => {
    const findings = check('frontend/src/a.ts', '// DECISIONS D-01: razlog\n// @ts-ignore\nexport const a = 1;\n');
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /neveljaven sklic D-01/);
  });

  it('FR-000-18: sklic na neobstoječ vnos je neveljaven', () => {
    const findings = check('frontend/src/a.ts', '// DECISIONS D-99: razlog\n// @ts-ignore\nexport const a = 1;\n');
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /neveljaven sklic D-99/);
  });

  for (const call of ['it.only', 'test.only', 'describe.only']) {
    it(`FR-000-18: ${call} je napaka tudi s sklicem`, () => {
      const findings = check('frontend/src/a.test.ts', `// DECISIONS D-02: razlog\n${call}('x', () => {});\n`);
      assert.deepEqual(kinds(findings), ['.only']);
      assert.equal(findings[0].line, 2);
      assert.match(findings[0].message, /\.only ni dovoljen/);
    });
  }
});

describe('suppressions – ni zadetka', () => {
  const clean = [
    ['frontend/src/a.ts', "export const company = 'any';\n"],
    ['frontend/src/a.ts', '// any value is fine here\nexport const a = 1;\n'],
    ['frontend/src/a.ts', 'export type Company = string;\nexport const anything = 1;\n'],
    ['frontend/src/a.ts', "export const s = 'eslint-disable @ts-ignore';\n"],
    ['frontend/src/a.test.ts', "it('skip only xit', () => {});\n"],
    ['backend/src/main/java/A.java', '// @Disabled in a comment\n/* @SuppressWarnings */\nclass A {}\n'],
    ['backend/src/main/java/A.java', 'class A { String s = "@SuppressWarnings"; }\n'],
  ];
  for (const [file, content] of clean) {
    it(`FR-000-18: brez zadetka – ${JSON.stringify(content.trim())}`, () => {
      assert.deepEqual(check(file, content), []);
    });
  }
});

describe('suppressions – ukazna vrstica', () => {
  it('FR-000-18: CLI pregleda datoteke pod Gitom in vrne 1 z datoteka:vrstica', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'cm-suppressions-'));
    mkdirSync(path.join(root, 'frontend/src'), { recursive: true });
    writeFileSync(path.join(root, 'DECISIONS.md'), decisions);
    writeFileSync(path.join(root, 'frontend/src/a.ts'), 'export const a = 1;\n// @ts-ignore\nexport const b = 2;\n');
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });

    const result = spawnSync('node', [path.join(here, '../suppressions.mjs'), '--root', root], { encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /frontend\/src\/a\.ts:2 {2}@ts-ignore {2}manjka sklic DECISIONS D-NN/);
  });
});
