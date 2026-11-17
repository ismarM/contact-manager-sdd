import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { API_OPERATIONS, API_VERSION } from './apiOperations';

// Seznam operacij na strani API in opis vmesnika zaledja morata biti enaka (FR-019-15, research R-08).

interface Description {
  info: { version: string };
  paths: Record<string, Record<string, unknown>>;
}

const description = JSON.parse(
  readFileSync(
    // Testi tečejo v mapi frontend (vitest.config.ts).
    resolve(process.cwd(), '../backend/src/main/resources/api/openapi-v1.json'),
    'utf-8',
  ),
) as Description;

describe('apiOperations', () => {
  it('FR-019-15: operacije na strani so natanko operacije iz openapi-v1.json (v obe smeri)', () => {
    const described = Object.entries(description.paths)
      .flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`))
      .sort();
    const listed = API_OPERATIONS.map((op) => `${op.method} ${op.path}`).sort();

    expect(listed).toEqual(described);
  });

  it('FR-019-19: različica na strani je različica opisa', () => {
    expect(API_VERSION).toBe(description.info.version);
  });
});
