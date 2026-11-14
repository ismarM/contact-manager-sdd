// FR-000-18: preverjanje utišanj, izklopljenih in osredotočenih testov (konstitucija VII).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findSuppressions } from '../suppressions.mjs';

const here = import.meta.dirname;
const check = (file, content) => findSuppressions([{ path: file, content }]);
const kinds = (findings) => findings.map((f) => f.kind);

describe('suppressions – brez razloga je napaka', () => {
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
    it(`FR-000-18: ${kind} brez razloga v ${file}:${line}`, () => {
      const findings = check(file, content);
      assert.equal(findings.length, 1, JSON.stringify(findings));
      assert.equal(findings[0].kind, kind);
      assert.equal(findings[0].file, file);
      assert.equal(findings[0].line, line);
      assert.match(findings[0].message, /manjka komentar »utišanje: <razlog>«/);
    });
  }
});

describe('suppressions – komentar z razlogom', () => {
  it('FR-000-18: razlog v predhodni vrstici je dovoljen', () => {
    const content = '// utišanje: razlog za test\n// eslint-disable-next-line no-console\nconsole.log(1);\n';
    assert.deepEqual(check('frontend/src/a.ts', content), []);
  });

  it('FR-000-18: razlog v isti vrstici je dovoljen', () => {
    const content = 'export let b: any = 1; // utišanje: razlog za test\n';
    assert.deepEqual(check('frontend/src/a.ts', content), []);
  });

  it('FR-000-18: izklopljen test z razlogom je dovoljen', () => {
    const content = "// utišanje: razlog za test\nit.skip('x', () => {});\n";
    assert.deepEqual(check('frontend/src/a.test.ts', content), []);
  });

  it('FR-000-18: @Disabled z razlogom je dovoljen', () => {
    const content = 'class ATest {\n  // utišanje: razlog za test\n  @Disabled\n  void t() {}\n}\n';
    assert.deepEqual(check('backend/src/test/java/ATest.java', content), []);
  });
});

describe('suppressions – prazen razlog in .only', () => {
  it('FR-000-18: oznaka brez razloga ne zadošča', () => {
    const findings = check('frontend/src/a.ts', '// utišanje:\n// @ts-ignore\nexport const a = 1;\n');
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /manjka komentar/);
  });

  it('FR-000-18: razlog dve vrstici više ne velja', () => {
    const content = '// utišanje: razlog za test\nexport const a = 1;\n// @ts-ignore\nexport const b = 2;\n';
    const findings = check('frontend/src/a.ts', content);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 3);
  });

  for (const call of ['it.only', 'test.only', 'describe.only']) {
    it(`FR-000-18: ${call} je napaka tudi z razlogom`, () => {
      const findings = check('frontend/src/a.test.ts', `// utišanje: razlog za test\n${call}('x', () => {});\n`);
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
    // brez dodatnih datotek: razlog je v komentarju ob utišanju
    writeFileSync(path.join(root, 'frontend/src/a.ts'), 'export const a = 1;\n// @ts-ignore\nexport const b = 2;\n');
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });

    const result = spawnSync('node', [path.join(here, '../suppressions.mjs'), '--root', root], { encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /frontend\/src\/a\.ts:2 {2}@ts-ignore {2}manjka komentar/);
  });
});
