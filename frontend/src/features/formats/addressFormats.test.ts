import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import formats from './addressFormats.json';

// Kopija tabele oblik naslovov zaledja (research R-04): obe strani morata biti enaki.

describe('addressFormats.json', () => {
  it('FR-016-12: je enaka datoteki zaledja address-formats.json', () => {
    const backend = JSON.parse(
      readFileSync(
        // Testi tečejo v mapi frontend (vitest.config.ts).
        resolve(process.cwd(), '../backend/src/main/resources/address-formats.json'),
        'utf-8',
      ),
    ) as unknown;
    expect(formats).toEqual(backend);
  });
});
