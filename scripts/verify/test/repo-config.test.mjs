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

describe('Pravi Firebase (lokalni razvoj)', () => {
  it('compose.firebase.yaml izklopi emulator, vrata objavi samo caddy (HTTPS) in nima vdelanih skrivnosti', () => {
    const file = read('compose.firebase.yaml');
    // Od fec1b7c je edini vhod caddy (80 za ACME in preusmeritev, 443 TCP/UDP); frontend svoja vrata ponastavi.
    const service = (name) => file.slice(file.indexOf(`\n  ${name}:`) + 1).split(/\n {2}\w/)[0];
    assert.match(service('frontend'), /^\s*ports: !reset \[\]/m);
    for (const name of ['auth', 'backend']) assert.doesNotMatch(service(name), /^\s*ports:/m);
    const caddyPorts = [...service('caddy').matchAll(/^\s*- "(\d+:\d+(?:\/udp)?)"/gm)].map((m) => m[1]);
    assert.deepEqual(caddyPorts, ['80:80', '443:443', '443:443/udp']);
    assert.equal(file.match(/^\s*ports:/gm)?.length, 2, 'vrata smeta imeti samo frontend (ponastavitev) in caddy');
    assert.match(file, /auth:\s*\n\s*profiles: \[emulator\]/);
    assert.match(file, /FIREBASE_AUTH_EMULATOR_HOST: ""/);
    assert.match(file, /VITE_FIREBASE_EMULATOR: "false"/);
    assert.match(file, /user: "\$\{FIREBASE_CONTAINER_UID:-1000\}:\$\{FIREBASE_CONTAINER_GID:-1000\}"/);
    assert.match(file, /firebase-admin\.json:ro/);
    assert.doesNotMatch(file, /AIza[\w-]{20,}/);
    for (const variable of ['FIREBASE_PROJECT_ID', 'FIREBASE_API_KEY', 'FIREBASE_SERVICE_ACCOUNT_FILE']) {
      assert.match(file, new RegExp(`\\$\\{${variable}:\\?`), `${variable} mora biti obvezen`);
    }
  });

  it('.env.firebase je v .gitignore, primer ne vsebuje ključev', () => {
    assert.match(read('.gitignore'), /^\.env\.firebase$/m);
    const example = read('.env.firebase.example');
    assert.match(example, /^FIREBASE_API_KEY=$/m);
    assert.match(example, /^FIREBASE_SERVICE_ACCOUNT_FILE=$/m);
  });

  it('nginx razrešuje emulator leno, da deluje brez storitve auth', () => {
    assert.match(read('frontend/nginx.conf'), /resolver 127\.0\.0\.11[\s\S]*proxy_pass \$auth_upstream;/);
  });
});

describe('Konfiguracija brez skrivnosti', () => {
  it('FR-000-04: .env.example navede spremenljivke s privzetki iz compose.yaml', () => {
    const compose = read('compose.yaml');
    const defaults = Object.fromEntries([...compose.matchAll(/\$\{(\w+):-([^}]*)\}/g)].map((m) => [m[1], m[2]]));
    assert.ok(Object.keys(defaults).length > 0, 'compose.yaml nima privzetkov ${VAR:-vrednost}');
    // Obvezne spremenljivke (${VAR:?…}) so v primeru navedene brez vrednosti.
    for (const [, name] of compose.matchAll(/\$\{(\w+):\?[^}]*\}/g)) defaults[name] = '';

    const example = Object.fromEntries(
      read('.env.example')
        .split('\n')
        .filter((line) => /^\w+=/.test(line))
        .map((line) => line.split(/=(.*)/s).slice(0, 2)),
    );
    assert.deepEqual(example, defaults);
  });

  it('019: podpisni ključ API ključev je obvezen, brez vrednosti v Gitu; verify.sh za E2E ustvari začasnega', () => {
    assert.match(read('compose.yaml'), /API_KEY_SIGNING_SECRET: \$\{API_KEY_SIGNING_SECRET:\?/);
    assert.match(read('.env.example'), /^API_KEY_SIGNING_SECRET=$/m);
    assert.match(read('backend/src/main/resources/application.yaml'), /signing-secret: \$\{API_KEY_SIGNING_SECRET:\}/);
    assert.match(
      read('verify.sh'),
      /if includes e2e && \[\[ -z \$\{API_KEY_SIGNING_SECRET:-\} \]\]; then\n\s+API_KEY_SIGNING_SECRET="\$\(openssl rand -base64 32/,
    );
  });

  it('robni primer: skripte imajo konce vrstic LF ne glede na nastavitev Gita', () => {
    assert.match(read('.gitattributes'), /^\*\.sh\s+.*eol=lf/m);
  });
});
