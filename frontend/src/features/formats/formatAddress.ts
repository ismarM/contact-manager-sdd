import type { Address } from '../attributes/types';
import formats from './addressFormats.json';
import type { AddressFormat } from './types';

const TEMPLATES = formats.formats as Record<string, string>;

function tidy(line: string): string {
  return line
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,(\s*,)+/g, ',')
    .replace(/^[-,\s]+|[-,\s]+$/g, '');
}

/**
 * Prikaz naslova po shemi (FR-016-16): *Po pravilih države* – deli v vrstnem redu države naslova (»1000 Ljubljana«,
 * »Springfield, IL 62701«), vrstice ločene z `\n`; *Enovrstično* – iste vrstice, ločene z vejicami. Nerazčlenjen
 * naslov (besedilo) je prikazan dobesedno. `countryName` doda državo kot zadnjo vrstico (atributi).
 */
export function formatAddress(
  address: Address | string,
  format: AddressFormat | null,
  countryName?: (code: string) => string,
): string {
  if (typeof address === 'string') return address;
  const template = (address.country && TEMPLATES[address.country]) || formats.default;
  const values: Record<string, string> = {
    '%A': [address.street, address.extra].filter(Boolean).join('%n'),
    '%Z': address.postalCode ?? '',
    '%C': address.city ?? '',
    '%S': address.region ?? '',
  };
  const text = template.replace(/%[ACSZ]/g, (token) => values[token] ?? '');
  const lines = text
    .split('%n')
    .map(tidy)
    .filter((line) => line !== '');
  if (address.country && countryName) lines.push(countryName(address.country));
  return format === 'SINGLE_LINE' ? lines.join(', ') : lines.join('\n');
}
