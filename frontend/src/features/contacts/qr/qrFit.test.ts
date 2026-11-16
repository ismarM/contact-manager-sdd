import { describe, expect, it } from 'vitest';

import { contactFromCode, scanResult } from './scanner';
import { fits, MAX_VERSION, qrContent } from './qrFit';
import { readVcards } from './vcardRead';
import type { CardContact } from './vcardWrite';

const BASE: CardContact = {
  firstName: 'Ana',
  lastName: 'Kos',
  address: null,
  email: 'ana@primer.si',
  phone: '+386 41 123 456',
  company: 'Žaga',
  country: 'AT',
  attributes: [],
  tags: [],
};

describe('vsebina kode QR (FR-014-15, -16)', () => {
  it('majhen kontakt je v kodi v celoti in se prebere nazaj', () => {
    const content = qrContent(
      { ...BASE, tags: ['alumni'], attributes: [{ key: 'Vloga', value: 'mentor' }] },
      'sl',
    );

    expect(content.omitted).toEqual([]);
    expect(content.included).toEqual([
      'name',
      'company',
      'email',
      'phone',
      'country',
      'tags',
      'attributes',
    ]);
    expect(readVcards(content.text, 'sl')[0]).toMatchObject({
      firstName: 'Ana',
      lastName: 'Kos',
      email: 'ana@primer.si',
      countryText: 'AT',
      tags: ['alumni'],
      attributes: [{ key: 'Vloga', value: 'mentor' }],
    });
  });

  it('prevelik kontakt izpusti najprej atribute, nato značke, nato naslov; obvezna polja ostanejo', () => {
    const attributes = Array.from({ length: 50 }, (_, i) => ({
      key: `Ključ ${i}`,
      value: 'x'.repeat(200),
    }));
    const tags = Array.from({ length: 30 }, (_, i) => `značka-${i}-${'z'.repeat(40)}`);
    const address = 'Dolga ulica '.repeat(25);

    const onlyAttributes = qrContent({ ...BASE, attributes }, 'sl');
    const tagsToo = qrContent({ ...BASE, attributes, tags }, 'sl');
    const all = qrContent({ ...BASE, attributes, tags, address: address + 'x'.repeat(3000) }, 'sl');

    expect(onlyAttributes.omitted).toEqual(['attributes']);
    expect(tagsToo.omitted).toEqual(['attributes', 'tags']);
    expect(all.omitted).toEqual(['attributes', 'tags', 'address']);
    for (const content of [onlyAttributes, tagsToo, all]) {
      expect(fits(content.text)).toBe(true);
      expect(content.included).toEqual(
        expect.arrayContaining(['name', 'company', 'email', 'phone', 'country']),
      );
    }
  });

  it('besedilo nad največjo različico ne gre v kodo', () => {
    expect(MAX_VERSION).toBe(25);
    expect(fits('x'.repeat(2000))).toBe(false);
  });
});

describe('branje kode (FR-014-18, -19)', () => {
  it('spletni naslov ni kontakt, več kod s kontakti je napaka, ena koda je kontakt', () => {
    const card = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Kos;Ana\r\nFN:Ana Kos\r\nEND:VCARD\r\n';

    expect(contactFromCode('https://primer.si', 'sl')).toBeNull();
    expect(scanResult([{ rawValue: 'https://primer.si' }], 'sl')).toEqual({ kind: 'none' });
    expect(scanResult([{ rawValue: card }, { rawValue: 'MECARD:N:Novak,Bor;;' }], 'sl')).toEqual({
      kind: 'many',
    });
    expect(scanResult([{ rawValue: card }, { rawValue: 'x' }], 'sl')).toMatchObject({
      kind: 'contact',
      candidate: { firstName: 'Ana', lastName: 'Kos' },
    });
  });
});
