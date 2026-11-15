import { AttributeList, blankToNull, cardLabels, type CardCandidate, type CardLanguage } from './vcardTypes';

// Branje kode QR v zapisu MECARD (pogost pri telefonih Android; spec Edge Cases, research R-07):
// `MECARD:N:Priimek,Ime;TEL:…;EMAIL:…;ADR:…;ORG:…;NOTE:…;URL:…;BDAY:YYYYMMDD;;`; ubežni znak je `\`.

export function isMecard(text: string): boolean {
  return /^MECARD:/i.test(text.trim());
}

export function readMecard(text: string, language: CardLanguage): CardCandidate | null {
  if (!isMecard(text)) return null;
  const labels = cardLabels(language);
  const fields = split(text.trim().slice('MECARD:'.length), ';');
  const values = new Map<string, string[]>();
  for (const field of fields) {
    const colon = field.indexOf(':');
    if (colon <= 0) continue;
    const name = field.slice(0, colon).toUpperCase();
    values.set(name, [...(values.get(name) ?? []), field.slice(colon + 1)]);
  }
  const [last, first] = split((values.get('N') ?? [''])[0] ?? '', ',').map((part) => blankToNull(unescape(part)));
  for (const [name, list] of values) values.set(name, list.map(unescape));
  const emails = values.get('EMAIL') ?? [];
  const phones = values.get('TEL') ?? [];
  const attributes = new AttributeList();
  emails.slice(1).forEach((email) => attributes.addNumbered(labels.email, 2, email));
  phones.slice(1).forEach((phone) => attributes.addNumbered(labels.phone, 2, phone));
  const bday = values.get('BDAY')?.[0];
  if (bday) {
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(bday);
    attributes.addNumbered(labels.birthday, 1, match ? `${match[1]}-${match[2]}-${match[3]}` : bday);
  }
  (values.get('URL') ?? []).forEach((url) => attributes.addNumbered(labels.website, 1, url));
  (values.get('NOTE') ?? []).forEach((note) => attributes.addNumbered(labels.note, 1, note));
  const firstName = first ?? null;
  const lastName = last ?? null;
  if (firstName == null && lastName == null) return null;
  return {
    firstName,
    lastName,
    address: blankToNull(values.get('ADR')?.[0]),
    email: blankToNull(emails[0]),
    phone: blankToNull(phones[0]),
    company: blankToNull(values.get('ORG')?.[0]),
    countryText: null,
    attributes: attributes.list(),
    tags: [],
  };
}

function split(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '\\' && i + 1 < value.length) {
      current += c + value[i + 1];
      i++;
    } else if (c === separator) {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  if (current !== '') parts.push(current);
  return parts;
}

function unescape(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}
