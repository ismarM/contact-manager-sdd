// FR-000-05 … FR-000-09: vedenje verify.sh in lib.sh (contracts/verify-cli.md).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const verify = path.join(root, 'verify.sh');
const lib = path.join(root, 'scripts/verify/lib.sh');
const fakePlan = path.join(import.meta.dirname, 'fixtures/fake-plan.sh');
const USAGE = 'Uporaba: ./verify.sh quick|full';

const run = (args, options = {}) => {
  const result = spawnSync('bash', args, { encoding: 'utf8', cwd: root, ...options });
  return { status: result.status, out: `${result.stdout}${result.stderr}`, stdout: result.stdout };
};

/** PATH z vsemi programi gostitelja razen izbranih (npr. java, docker). */
function pathWithout(excluded) {
  const bin = mkdtempSync(path.join(tmpdir(), 'cm-path-'));
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir || !existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (excluded.includes(name)) continue;
      try {
        symlinkSync(path.join(dir, name), path.join(bin, name));
      } catch (error) {
        // Prvi vnos v PATH zmaga. `existsSync` bi pokvarjeno povezavo (npr. /bin/grub-ntldr-img na Ubuntu 26.04, kjer
        // so /bin, /usr/bin in /sbin ista mapa) štel kot neobstoječo in ponovni poskus bi padel z EEXIST (D-33).
        if (error.code !== 'EEXIST') throw error;
      }
    }
  }
  return bin;
}

const quickSteps = ['format', 'lint', 'tipi', 'utišanja', 'prevodi', 'orodja', 'unit BE', 'unit FE', 'funkcionalni FE'];
const fullSteps = [...quickSteps, 'integracijski BE', 'varnostni BE', 'sistem', 'E2E'];

describe('verify.sh – argumenti', () => {
  for (const args of [[], ['foo'], ['quick', 'full']]) {
    it(`FR-000-07: ${JSON.stringify(args)} → navodilo in koda 2`, () => {
      const result = run([verify, ...args]);
      assert.equal(result.status, 2);
      assert.ok(result.out.includes(USAGE), result.out);
    });
  }

  it('FR-000-07: deluje enako iz podmape', () => {
    const result = run(['../verify.sh', 'foo'], { cwd: path.join(root, 'frontend') });
    assert.equal(result.status, 2);
    assert.ok(result.out.includes(USAGE), result.out);
  });
});

describe('verify.sh – seznam korakov', () => {
  it('FR-000-05: quick izvede korake 1–9 iz pogodbe', () => {
    const result = run([verify, 'quick'], { env: { ...process.env, VERIFY_LIST_STEPS: '1' } });
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout.trim().split('\n'), quickSteps);
  });

  it('FR-000-06: full izvede korake 1–13 iz pogodbe', () => {
    const result = run([verify, 'full'], { env: { ...process.env, VERIFY_LIST_STEPS: '1' } });
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout.trim().split('\n'), fullSteps);
  });
});

describe('verify.sh – manjkajoča orodja', () => {
  it('FR-000-07: brez Jave → koda 3 in ime orodja', () => {
    const env = { ...process.env, PATH: pathWithout(['java', 'javac']) };
    delete env.JAVA_HOME;
    const result = run([verify, 'quick'], { env });
    assert.equal(result.status, 3, result.out);
    assert.match(result.out, /java/i);
  });

  it('FR-000-06: full brez Dockerja → koda 3 in sporočilo, da potrebuje Docker', () => {
    assert.ok(process.env.JAVA_HOME, 'JAVA_HOME mora biti nastavljen (verify.sh ga nastavi za korak orodja)');
    const env = { ...process.env, PATH: pathWithout(['docker']) };
    const result = run([verify, 'full'], { env });
    assert.equal(result.status, 3, result.out);
    assert.ok(result.out.includes('potrebuje Docker'), result.out);
  });
});

describe('lib.sh – pravilo ustavljanja in izpis', () => {
  const runPlan = (plan, extra = {}) => {
    const verifyRoot = extra.verifyRoot ?? mkdtempSync(path.join(tmpdir(), 'cm-verify-'));
    const markers = path.join(verifyRoot, 'markers');
    mkdirSync(markers, { recursive: true });
    const result = run([fakePlan], {
      env: { ...process.env, LIB: lib, PLAN: plan, MARKERS: markers, VERIFY_ROOT: verifyRoot, MARK: extra.mark ?? '' },
    });
    return { ...result, verifyRoot, markers };
  };

  it('FR-000-07: vsi statični koraki se izvedejo, testni ne, če je statični padel', () => {
    const result = runPlan('static-fail');
    assert.equal(result.status, 1);
    const lines = result.stdout.trimEnd().split('\n');
    assert.match(lines[0], /^✗ quick PADLO \(\d+ s\) – koraki: s2, s3$/);
    assert.ok(lines.includes('s2  napaka-s2'), result.stdout);
    assert.ok(lines.includes('s3  napaka-s3'), result.stdout);
    assert.ok(lines.length <= 20);
    assert.equal(existsSync(path.join(result.markers, 't1')), false, 'testni korak t1 se ne sme izvesti');
  });

  it('FR-000-07: testni koraki se ustavijo pri prvem padlem', () => {
    const result = runPlan('test-fail');
    assert.equal(result.status, 1);
    assert.match(result.stdout.split('\n')[0], /^✗ quick PADLO \(\d+ s\) – koraki: t1$/);
    assert.equal(existsSync(path.join(result.markers, 't2')), false, 'korak t2 se ne sme izvesti');
  });

  it('FR-000-08: uspeh → natanko ena vrstica z ravnjo in trajanjem', () => {
    const result = runPlan('ok');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^✓ quick OK \(\d+ s\)\n$/);
  });

  it('FR-000-09: .verify/last.log vsebuje celoten izpis samo zadnjega zagona', () => {
    const verifyRoot = mkdtempSync(path.join(tmpdir(), 'cm-verify-'));
    runPlan('ok', { verifyRoot, mark: 'oznaka-prvi' });
    runPlan('ok', { verifyRoot, mark: 'oznaka-drugi' });

    const log = readFileSync(path.join(verifyRoot, '.verify/last.log'), 'utf8');
    assert.ok(log.includes('=== s1'), log);
    assert.ok(log.includes('oznaka-drugi'), log);
    assert.ok(!log.includes('oznaka-prvi'), log);
  });

  it('FR-000-09: .verify/ je izključena iz Gita', () => {
    const result = spawnSync('git', ['check-ignore', '-q', '.verify/last.log'], { cwd: root });
    assert.equal(result.status, 0);
  });
});
