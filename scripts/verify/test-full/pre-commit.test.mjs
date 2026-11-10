// FR-000-19: pre-commit kavelj z gitleaks prepreči commit skrivnosti (research R-13).
// Potrebuje gitleaks na PATH ali Docker, zato teče v koraku "varnostni BE" (full).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');

/** Lažen zasebni ključ, sestavljen ob zagonu, da v repozitoriju ni ničesar, kar bi gitleaks prepoznal. */
function fakePrivateKey() {
  const body = randomBytes(600).toString('base64').match(/.{1,64}/g).join('\n');
  const label = ['RSA', 'PRIVATE', 'KEY'].join(' ');
  return { body, text: `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n` };
}

function repoWithHooks() {
  for (const file of ['.githooks/pre-commit', 'scripts/install-hooks.sh', '.gitleaks.toml']) {
    assert.ok(existsSync(path.join(root, file)), `${file} ne obstaja`);
  }
  const repo = mkdtempSync(path.join(tmpdir(), 'cm-hooks-'));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  cpSync(path.join(root, '.githooks'), path.join(repo, '.githooks'), { recursive: true });
  cpSync(path.join(root, 'scripts/install-hooks.sh'), path.join(repo, 'scripts/install-hooks.sh'));
  cpSync(path.join(root, '.gitleaks.toml'), path.join(repo, '.gitleaks.toml'));
  execFileSync('bash', ['scripts/install-hooks.sh'], { cwd: repo });
  return { repo, git };
}

describe('pre-commit z gitleaks', () => {
  it('FR-000-19: en ukaz namesti kavelj (core.hooksPath = .githooks)', () => {
    const { git } = repoWithHooks();
    assert.equal(git('config', 'core.hooksPath').trim(), '.githooks');
  });

  it('FR-000-19: commit s skrivnostjo se ne ustvari, izpis skrije vrednost', () => {
    const { repo, git } = repoWithHooks();
    const key = fakePrivateKey();
    writeFileSync(path.join(repo, 'config.txt'), `ime=test\n${key.text}`);
    git('add', 'config.txt');

    const result = spawnSync('git', ['commit', '-m', 'skrivnost'], { cwd: repo, encoding: 'utf8' });
    const out = `${result.stdout}${result.stderr}`;

    assert.notEqual(result.status, 0, out);
    assert.ok(out.includes('config.txt'), out);
    assert.match(out, /private-key/i);
    assert.ok(!out.includes(key.body.split('\n')[1]), 'izpis vsebuje vrednost ključa');
    const head = spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: repo });
    assert.notEqual(head.status, 0, 'commit je bil ustvarjen');
  });

  it('FR-000-19: commit brez skrivnosti uspe', () => {
    const { repo, git } = repoWithHooks();
    writeFileSync(path.join(repo, 'README.md'), '# Brez skrivnosti\n');
    git('add', 'README.md');

    const result = spawnSync('git', ['commit', '-m', 'čisto'], { cwd: repo, encoding: 'utf8' });

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });

  it('FR-000-19: v Git worktreeju je skrivnost zaznana, čist commit uspe', () => {
    const { repo, git } = repoWithHooks();
    writeFileSync(path.join(repo, 'README.md'), '# Začetek\n');
    git('add', '.');
    git('commit', '-q', '-m', 'začetek');
    const tree = path.join(mkdtempSync(path.join(tmpdir(), 'cm-worktree-')), 'wt');
    git('worktree', 'add', '-q', '-b', 'veja', tree);
    const gitIn = (...args) => spawnSync('git', args, { cwd: tree, encoding: 'utf8' });

    const key = fakePrivateKey();
    writeFileSync(path.join(tree, 'config.txt'), `ime=test\n${key.text}`);
    gitIn('add', 'config.txt');
    const leak = gitIn('commit', '-m', 'skrivnost');
    const leakOut = `${leak.stdout}${leak.stderr}`;
    assert.notEqual(leak.status, 0, leakOut);
    assert.ok(leakOut.includes('config.txt'), leakOut);
    assert.ok(!leakOut.includes(key.body.split('\n')[1]), 'izpis vsebuje vrednost ključa');

    gitIn('reset', '-q');
    writeFileSync(path.join(tree, 'config.txt'), 'ime=test\n');
    gitIn('add', 'config.txt');
    const clean = gitIn('commit', '-m', 'čisto');
    assert.equal(clean.status, 0, `${clean.stdout}${clean.stderr}`);
    assert.match(`${clean.stdout}${clean.stderr}`.replace(/\x1b\[[0-9;]*m/g, ''), /scanned ~[1-9][0-9]* bytes/);
  });
});

/** Repozitorij z nameščenim kavljem in lažnim `gitleaks` na PATH (brez pravega orodja ali Dockerja). */
function repoWithFakeGitleaks(fakeOutput, exitCode = 0) {
  const { repo, git } = repoWithHooks();
  const bin = mkdtempSync(path.join(tmpdir(), 'cm-fakebin-'));
  const fake = path.join(bin, 'gitleaks');
  writeFileSync(fake, `#!/bin/sh\ncat <<'OUT'\n${fakeOutput}\nOUT\nexit ${exitCode}\n`);
  chmodSync(fake, 0o755);
  mkdirSync(bin, { recursive: true });
  const commit = (message) =>
    spawnSync('git', ['commit', '-m', message], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
  return { repo, git, commit };
}

describe('pre-commit ne poroča lažnega uspeha', () => {
  const ZERO = '10:00PM INF 0 commits scanned.\n10:00PM INF scanned ~0 bytes (0) in 1ms\n10:00PM INF no leaks found';

  it('FR-000-19: 0 pregledanih bajtov ob besedilnih spremembah → commit odpove', () => {
    const { repo, git, commit } = repoWithFakeGitleaks(ZERO);
    writeFileSync(path.join(repo, 'a.txt'), 'vsebina\n');
    git('add', 'a.txt');
    const result = commit('brez pregleda');
    assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /ni pregledal nobenega bajta/);
  });

  it('FR-000-19: napaka gitleaks (ERR) ob izhodni kodi 0 → commit odpove', () => {
    const out = '10:00PM ERR error="stderr is not empty"\n10:00PM INF scanned ~900 bytes (900) in 1ms\n10:00PM INF no leaks found';
    const { repo, git, commit } = repoWithFakeGitleaks(out);
    writeFileSync(path.join(repo, 'a.txt'), 'vsebina\n');
    git('add', 'a.txt');
    const result = commit('napaka');
    assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /javil napako/);
  });

  it('FR-000-19: pregledani bajti in brez napak → commit uspe', () => {
    const out = '10:00PM INF 0 commits scanned.\n10:00PM INF scanned ~900 bytes (900) in 1ms\n10:00PM INF no leaks found';
    const { repo, git, commit } = repoWithFakeGitleaks(out);
    writeFileSync(path.join(repo, 'a.txt'), 'vsebina\n');
    git('add', 'a.txt');
    const result = commit('pregledano');
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });

  it('FR-000-19: samo binarna sprememba ne zahteva pregledanih bajtov', () => {
    const { repo, git, commit } = repoWithFakeGitleaks(ZERO);
    writeFileSync(path.join(repo, 'b.bin'), Buffer.from([0, 1, 2, 0, 255, 0]));
    git('add', 'b.bin');
    const result = commit('binarno');
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });

  it('FR-000-19: izhodna koda gitleaks ≠ 0 (najdena skrivnost) odpove commit', () => {
    const { repo, git, commit } = repoWithFakeGitleaks('Finding: REDACTED\nFile: a.txt', 1);
    writeFileSync(path.join(repo, 'a.txt'), 'vsebina\n');
    git('add', 'a.txt');
    const result = commit('skrivnost');
    assert.notEqual(result.status, 0);
  });
});
