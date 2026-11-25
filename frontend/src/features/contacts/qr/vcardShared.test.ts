/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readMecard } from './mecard';
import { readVcards } from './vcardRead';
import type { CardCandidate, CardLanguage } from './vcardTypes';
import { writeVcard } from './vcardWrite';

// Skupne testne vizitke z zaledjem (docs/specs/014-uvoz-izvoz/research.md R-03): isti vzorci kot `VcardMappingTest`.
// Vitest teče v mapi frontend (verify.sh, CI).
const SHARED = path.resolve(process.cwd(), '..', 'backend', 'src', 'test', 'resources', 'vcard');

function shared(name: string): string {
  return readFileSync(path.join(SHARED, name), 'utf-8');
}

const lf = (text: string) => text.replace(/\r\n/g, '\n');

const contactFull = JSON.parse(shared('contact-full.json')) as CardCandidate;

describe('skupne vizitke (FR-014-11, -12, -13)', () => {
  it.each(['qp-21', 'phone-30', 'fn-only-40', 'typed-50'])(
    '%s se prebere kot v zaledju',
    (name) => {
      const expected = JSON.parse(shared(`cases/${name}.json`)) as {
        language: CardLanguage;
        candidates: CardCandidate[];
      };

      expect(readVcards(shared(`cases/${name}.vcf`), expected.language)).toEqual(
        expected.candidates,
      );
    },
  );

  it('pisalnik frontenda da svoj skupni vzorec', () => {
    const written = writeVcard({ ...contactFull, country: contactFull.countryText }, 'sl');

    expect(lf(written)).toBe(lf(shared('written-frontend.vcf')));
  });

  it.each(['written-backend.vcf', 'written-frontend.vcf'])(
    '%s se prebere v isti kontakt',
    (sample) => {
      expect(readVcards(shared(sample), 'sl')).toEqual([contactFull]);
    },
  );

  it('besedilo, ki ni vizitka, ne da kandidata', () => {
    expect(readVcards('https://primer.si', 'sl')).toEqual([]);
  });
});

describe('MECARD (Edge Cases)', () => {
  it('prebere ime, telefone, e-naslov in opombo', () => {
    expect(
      readMecard(
        'MECARD:N:Kos,Ana;TEL:041 111 222;TEL:01 333 444;EMAIL:ana@primer.si;NOTE:Bled\\; 2025;ORG:Acme;;',
        'sl',
      ),
    ).toEqual({
      firstName: 'Ana',
      lastName: 'Kos',
      address: null,
      email: 'ana@primer.si',
      phone: '041 111 222',
      company: 'Acme',
      countryText: null,
      attributes: [
        { key: 'Telefon 2', value: '01 333 444' },
        { key: 'Opomba', value: 'Bled; 2025' },
      ],
      tags: [],
    });
  });

  it('ni MECARD → null', () => {
    expect(readMecard('BEGIN:VCARD', 'sl')).toBeNull();
  });
});
