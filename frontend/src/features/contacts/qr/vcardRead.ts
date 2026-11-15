import { isCountryCode } from '../countries';
import {
  AttributeList,
  blankToNull,
  cardLabels,
  categoryTag,
  splitFullName,
  unescapeText,
  type CardCandidate,
  type CardLanguage,
} from './vcardTypes';

// Branje vizitk vCard 2.1, 3.0 in 4.0 (FR-014-13, FR-014-18; research R-03, R-07): enaka pravila kot `VcardReader`
// v zaledju; skladnost varujejo skupne vizitke `backend/src/test/resources/vcard/`.

interface Property {
  group: string | null;
  name: string;
  params: Map<string, string[]>;
  value: string;
}

/** Vse vizitke v besedilu; prazen seznam, če besedilo ni vCard. */
export function readVcards(text: string, language: CardLanguage): CardCandidate[] {
  const cards: Property[][] = [];
  let current: Property[] | null = null;
  let version = '3.0';
  const versions: string[] = [];
  for (const line of unfold(text)) {
    const property = parseLine(line);
    if (!property) continue;
    if (property.name === 'BEGIN' && property.value.toUpperCase() === 'VCARD') {
      current = [];
      version = '3.0';
    } else if (property.name === 'END' && property.value.toUpperCase() === 'VCARD') {
      if (current) {
        cards.push(current);
        versions.push(version);
      }
      current = null;
    } else if (current) {
      if (property.name === 'VERSION') version = property.value.trim();
      else current.push(property);
    }
  }
  return cards.map((card, i) => candidate(card, versions[i] ?? '3.0', language));
}

function candidate(card: Property[], version: string, language: CardLanguage): CardCandidate {
  const labels = cardLabels(language);
  const values = card.map((p) => ({ ...p, value: decode(p) }));
  const all = (name: string) => values.filter((p) => p.name === name);
  const first = (name: string) => all(name)[0];

  let firstName: string | null = null;
  let lastName: string | null = null;
  const n = first('N');
  if (n) {
    const parts = splitUnescaped(n.value, ';');
    const given = [unescapeText(parts[1] ?? ''), ...listItems(parts[2] ?? '')].filter((s) => s.trim() !== '');
    firstName = blankToNull(given.join(' '));
    lastName = blankToNull(unescapeText(parts[0] ?? ''));
  }
  const fn = first('FN');
  if (firstName == null && lastName == null && fn) {
    [firstName, lastName] = splitFullName(unescapeText(fn.value));
  }

  const attributes = new AttributeList();
  const pairs = new Map<string, [string | null, string | null]>();
  for (const p of values) {
    if (!p.group || (p.name !== 'X-CM-KEY' && p.name !== 'X-CM-VALUE')) continue;
    const pair = pairs.get(p.group) ?? [null, null];
    pair[p.name === 'X-CM-KEY' ? 0 : 1] = unescapeText(p.value);
    pairs.set(p.group, pair);
  }
  for (const [key, value] of pairs.values()) {
    if (key != null && value != null) attributes.add(key, value);
  }

  const emails = preferredFirst(all('EMAIL'));
  const phones = preferredFirst(all('TEL'));
  const addresses = preferredFirst(all('ADR'));
  const phoneText = (p: Property) => {
    const text = unescapeText(p.value);
    const uri = (p.params.get('VALUE') ?? []).some((v) => v.toLowerCase() === 'uri') || version.startsWith('4');
    return uri && text.toLowerCase().startsWith('tel:') ? (text.slice(4).split(';')[0] ?? '') : text;
  };

  const email = emails[0] ? unescapeText(emails[0].value) : null;
  const phone = phones[0] ? phoneText(phones[0]) : null;
  const address = addresses[0] ? addressText(addresses[0]) : null;
  const countryText = addresses[0] ? addressCountry(addresses[0]) : null;
  emails.slice(1).forEach((p) => attributes.addNumbered(labels.email, 2, unescapeText(p.value)));
  phones.slice(1).forEach((p) => attributes.addNumbered(labels.phone, 2, phoneText(p)));
  addresses.slice(1).forEach((p) => {
    const parts = (addressText(p) ?? '').split('\n').filter((s) => s !== '');
    const country = join(listItems(splitUnescaped(p.value, ';')[6] ?? ''));
    if (country.trim() !== '') parts.push(country.trim());
    attributes.addNumbered(labels.address, 2, blankToNull(parts.join(', ')));
  });
  const bday = first('BDAY');
  if (bday) attributes.addNumbered(labels.birthday, 1, birthday(unescapeText(bday.value)));
  all('URL').forEach((p) => attributes.addNumbered(labels.website, 1, unescapeText(p.value)));
  all('NOTE').forEach((p) => attributes.addNumbered(labels.note, 1, unescapeText(p.value)));

  const org = first('ORG');
  const company = org ? blankToNull(unescapeText(splitUnescaped(org.value, ';')[0] ?? '')) : null;
  const tags = all('CATEGORIES').flatMap((p) =>
    listItems(p.value)
      .map(categoryTag)
      .filter((t): t is string => t != null),
  );

  return { firstName, lastName, address, email, phone, company, countryText, attributes: attributes.list(), tags };
}

/** Prednostna lastnost (najmanjši `PREF` ali `TYPE=pref`) na začetek, ostale v vrstnem redu. */
function preferredFirst(properties: Property[]): Property[] {
  let best: Property | null = null;
  let bestRank = Number.MAX_SAFE_INTEGER;
  for (const p of properties) {
    const pref = Number.parseInt(p.params.get('PREF')?.[0] ?? '', 10);
    const typePref = (p.params.get('TYPE') ?? []).some((t) => t.toLowerCase() === 'pref');
    const rank = Number.isNaN(pref) ? (typePref ? 100 : Number.MAX_SAFE_INTEGER) : pref;
    if (rank < bestRank) {
      best = p;
      bestRank = rank;
    }
  }
  return best ? [best, ...properties.filter((p) => p !== best)] : [...properties];
}

/** Vrstice naslova: poštni predal, dodatni naslov, ulica, »poštna številka kraj«, regija. */
function addressText(p: Property): string | null {
  const parts = splitUnescaped(p.value, ';').map((part) => join(listItems(part)));
  const lines: string[] = [];
  const add = (line: string) =>
    line
      .split('\n')
      .filter((s) => s.trim() !== '')
      .forEach((s) => lines.push(s.trim()));
  add(parts[0] ?? '');
  add(parts[1] ?? '');
  add(parts[2] ?? '');
  add(`${parts[5] ?? ''} ${parts[3] ?? ''}`.trim());
  add(parts[4] ?? '');
  return blankToNull(lines.join('\n'));
}

function addressCountry(p: Property): string | null {
  const code = (p.params.get('X-CM-CC')?.[0] ?? '').trim().toUpperCase();
  if (isCountryCode(code)) return code;
  return blankToNull(join(listItems(splitUnescaped(p.value, ';')[6] ?? '')));
}

function birthday(text: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const compact = /^(\d{4})(\d{2})(\d{2})(T.*)?$/.exec(text);
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : text;
}

function join(items: string[]): string {
  return items.filter((s) => s.trim() !== '').join(', ');
}

/** Elementi seznama, ločenega z neubežnimi vejicami, brez ubežnih znakov. */
function listItems(value: string): string[] {
  return splitUnescaped(value, ',').map(unescapeText);
}

function splitUnescaped(value: string, separator: string): string[] {
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
  parts.push(current);
  return parts;
}

/** Združi zložene vrstice (RFC 6350) in mehke prelome QUOTED-PRINTABLE (2.1). */
function unfold(text: string): string[] {
  const raw = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const lines: string[] = [];
  for (const line of raw) {
    const last = lines.length - 1;
    if ((line.startsWith(' ') || line.startsWith('\t')) && last >= 0) {
      lines[last] += line.slice(1);
    } else if (last >= 0 && /QUOTED-PRINTABLE/i.test(lines[last]!.split(':')[0] ?? '') && lines[last]!.endsWith('=')) {
      lines[last] = lines[last]!.slice(0, -1) + line;
    } else {
      lines.push(line);
    }
  }
  return lines.filter((line) => line.trim() !== '');
}

const BARE_ENCODINGS = new Set(['QUOTED-PRINTABLE', 'BASE64', '8BIT', '7BIT', 'B']);

function parseLine(line: string): Property | null {
  let colon = -1;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon).split(';');
  const nameWithGroup = head[0] ?? '';
  const dot = nameWithGroup.indexOf('.');
  const group = dot >= 0 ? nameWithGroup.slice(0, dot).toLowerCase() : null;
  const name = (dot >= 0 ? nameWithGroup.slice(dot + 1) : nameWithGroup).toUpperCase();
  const params = new Map<string, string[]>();
  for (const param of head.slice(1)) {
    const eq = param.indexOf('=');
    const key = (eq >= 0 ? param.slice(0, eq) : BARE_ENCODINGS.has(param.toUpperCase()) ? 'ENCODING' : 'TYPE')
      .trim()
      .toUpperCase();
    const values = (eq >= 0 ? param.slice(eq + 1) : param).replace(/"/g, '').split(',');
    params.set(key, [...(params.get(key) ?? []), ...values]);
  }
  return { group, name, params, value: line.slice(colon + 1) };
}

/** Vrednost po kodiranju 2.1 (`QUOTED-PRINTABLE`, `CHARSET`). */
function decode(p: Property): string {
  const encoding = (p.params.get('ENCODING')?.[0] ?? '').toUpperCase();
  if (encoding !== 'QUOTED-PRINTABLE') return p.value;
  const bytes: number[] = [];
  for (let i = 0; i < p.value.length; i++) {
    const c = p.value[i]!;
    const hex = p.value.slice(i + 1, i + 3);
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(c));
    }
  }
  const charset = p.params.get('CHARSET')?.[0] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }
}
