// FR-000-01, FR-000-04, FR-000-06: statične lastnosti konfiguracije (research R-08).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => {
  const full = path.join(root, file);
  assert.ok(existsSync(full), `${file} ne obstaja`);
  return readFileSync(full, 'utf8');
};
const published = (yaml) => [...yaml.matchAll(/"?(\d+\.\d+\.\d+\.\d+:\d*:\d+)"?/g)].map((m) => m[1]).sort();

describe('Docker Compose', () => {
  it('FR-000-01: compose.yaml ima štiri storitve in ne objavlja vrat', () => {
    const compose = read('compose.yaml');
    for (const service of ['db', 'auth', 'backend', 'frontend']) {
      assert.match(compose, new RegExp(`^ {2}${service}:`, 'm'), `manjka storitev ${service}`);
    }
    assert.doesNotMatch(compose, /^\s*ports:/m);
  });

  it('FR-000-02: Compose čaka na preverjanje zdravja zaledja', () => {
    const compose = read('compose.yaml');
    const service = (name) => compose.slice(compose.indexOf(`\n  ${name}:`) + 1).split(/\n {2}\w/)[0];
    assert.match(service('backend'), /healthcheck:[\s\S]*\/api\/health/);
    assert.match(service('frontend'), /backend:\s*\n\s*condition: service_healthy/);
    for (const dependency of ['db', 'auth']) {
      assert.match(service('backend'), new RegExp(`${dependency}:\\s*\\n\\s*condition: service_healthy`));
    }
  });

  it('FR-000-01: razvojni override objavi samo frontend in emulator na 127.0.0.1', () => {
    assert.deepEqual(published(read('compose.override.yaml')), ['127.0.0.1:8080:80', '127.0.0.1:9099:9099']);
  });

  it('FR-000-06: verify full objavi frontend na naključnih vratih 127.0.0.1', () => {
    assert.deepEqual(published(read('compose.verify.yaml')), ['127.0.0.1::80']);
  });
});

describe('Konfiguracija brez skrivnosti', () => {
  it('FR-000-04: .env.example navede spremenljivke s privzetki iz compose.yaml', () => {
    const compose = read('compose.yaml');
    const defaults = Object.fromEntries([...compose.matchAll(/\$\{(\w+):-([^}]*)\}/g)].map((m) => [m[1], m[2]]));
    assert.ok(Object.keys(defaults).length > 0, 'compose.yaml nima privzetkov ${VAR:-vrednost}');

    const example = Object.fromEntries(
      read('.env.example')
        .split('\n')
        .filter((line) => /^\w+=/.test(line))
        .map((line) => line.split(/=(.*)/s).slice(0, 2)),
    );
    assert.deepEqual(example, defaults);
  });

  it('robni primer: skripte imajo konce vrstic LF ne glede na nastavitev Gita', () => {
    assert.match(read('.gitattributes'), /^\*\.sh\s+.*eol=lf/m);
  });
});
