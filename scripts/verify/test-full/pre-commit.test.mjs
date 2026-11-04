// FR-000-19: pre-commit kavelj z gitleaks prepreči commit skrivnosti (research R-13).
// Potrebuje gitleaks na PATH ali Docker, zato teče v koraku "varnostni BE" (full).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
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
});
