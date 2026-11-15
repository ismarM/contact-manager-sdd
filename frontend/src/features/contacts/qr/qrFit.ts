import QRCode from 'qrcode';

import type { CardLanguage } from './vcardTypes';
import { type CardContact, writeVcard } from './vcardWrite';

// Vsebina kode QR (FR-014-15, -16; research R-06): celotna vizitka, če gre v kodo različice ≤ 25 s popravljanjem
// napak M; sicer se izpuščajo dodatni atributi, nato značke, nato naslov. Ime, priimek, e-naslov, telefon, podjetje
// in država so vedno vključeni.

export const MAX_VERSION = 25;

export type QrField =
  'name' | 'company' | 'email' | 'phone' | 'country' | 'address' | 'tags' | 'attributes';

export interface QrContent {
  text: string;
  included: QrField[];
  omitted: QrField[];
}

/** Ali besedilo gre v kodo QR z dovoljeno največjo različico. */
export function fits(text: string): boolean {
  try {
    return QRCode.create(text, { errorCorrectionLevel: 'M' }).version <= MAX_VERSION;
  } catch {
    return false;
  }
}

export function qrContent(contact: CardContact, language: CardLanguage): QrContent {
  const omissions: QrField[][] = [
    [],
    ['attributes'],
    ['attributes', 'tags'],
    ['attributes', 'tags', 'address'],
  ];
  for (const omitted of omissions) {
    const reduced: CardContact = {
      ...contact,
      attributes: omitted.includes('attributes') ? [] : contact.attributes,
      tags: omitted.includes('tags') ? [] : contact.tags,
      address: omitted.includes('address') ? null : contact.address,
    };
    const text = writeVcard(reduced, language);
    if (fits(text)) {
      return {
        text,
        included: present(reduced),
        omitted: omitted.filter((field) => has(contact, field)),
      };
    }
  }
  const minimal = { ...contact, attributes: [], tags: [], address: null };
  return {
    text: writeVcard(minimal, language),
    included: present(minimal),
    omitted: (['attributes', 'tags', 'address'] as QrField[]).filter((field) =>
      has(contact, field),
    ),
  };
}

function has(contact: CardContact, field: QrField): boolean {
  switch (field) {
    case 'name':
      return Boolean(contact.firstName || contact.lastName);
    case 'attributes':
      return contact.attributes.length > 0;
    case 'tags':
      return contact.tags.length > 0;
    default:
      return Boolean(contact[field]);
  }
}

function present(contact: CardContact): QrField[] {
  return (
    ['name', 'company', 'email', 'phone', 'country', 'address', 'tags', 'attributes'] as QrField[]
  ).filter((field) => has(contact, field));
}
