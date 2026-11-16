import { countryName } from '../countries';
import type { Attribute } from '../types';
import { escapeText, type CardLanguage } from './vcardTypes';

// Zapis kontakta kot vizitke vCard 3.0 (FR-014-11, FR-014-15; research R-03): ista preslikava kot `VcardWriter`
// v zaledju (skupni vzorec `backend/src/test/resources/vcard/written-frontend.vcf`). Brez UID/REV in brez zlaganja vrstic.

export interface CardContact {
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  country: string | null;
  attributes: Attribute[];
  tags: string[];
}

export function writeVcard(contact: CardContact, language: CardLanguage): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(
    `N:${trimTrailing([contact.lastName ?? '', contact.firstName ?? ''].map(escapeText))}`,
  );
  lines.push(`FN:${escapeText(fullName(contact))}`);
  if (contact.company) lines.push(`ORG:${escapeText(contact.company)}`);
  if (contact.email) lines.push(`EMAIL;TYPE=internet:${escapeText(contact.email)}`);
  if (contact.phone) lines.push(`TEL;TYPE=voice:${escapeText(contact.phone)}`);
  if (contact.address || contact.country) {
    const country = contact.country ? escapeText(countryName(contact.country, language)) : '';
    const params = contact.country ? `;X-CM-CC=${contact.country}` : '';
    lines.push(`ADR${params}:;;${escapeText(contact.address ?? '')};;;;${country}`);
  }
  if (contact.tags.length > 0) lines.push(`CATEGORIES:${contact.tags.map(escapeText).join(',')}`);
  contact.attributes.forEach((attribute, i) => {
    lines.push(`attr${i + 1}.X-CM-KEY:${escapeText(attribute.key)}`);
    lines.push(`attr${i + 1}.X-CM-VALUE:${escapeText(attribute.value)}`);
  });
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

function fullName(contact: CardContact): string {
  return [contact.firstName, contact.lastName].filter((part) => part).join(' ');
}

/** Strukturirana vrednost brez praznih komponent na koncu (kot ez-vcard). */
function trimTrailing(components: string[]): string {
  const list = [...components];
  while (list.length > 1 && list[list.length - 1] === '') list.pop();
  return list.join(';');
}
