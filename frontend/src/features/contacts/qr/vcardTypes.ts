import type { Address, AttributeType } from '../../attributes/types';
import type { Attribute } from '../types';

// Kandidat iz vizitke (specs/014-uvoz-izvoz/data-model.md – ImportCandidate); enaka oblika kot v zaledju.
export interface CardCandidate {
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  /** 016: deli naslova (`ADR` po delih); `address` je tedaj `null`. */
  addressParts?: Address | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  /** Besedilo ali koda države iz vizitke (`X-CM-CC` ima prednost). */
  countryText: string | null;
  attributes: Attribute[];
  tags: string[];
}

export type CardLanguage = 'sl' | 'en';

interface Labels {
  email: string;
  phone: string;
  address: string;
  birthday: string;
  website: string;
  note: string;
}

// Oznake atributov iz vizitke v jeziku vmesnika (FR-014-13); enake kot `VcardMapping.Labels` v zaledju.
const LABELS: Record<CardLanguage, Labels> = {
  sl: {
    email: 'E-naslov',
    phone: 'Telefon',
    address: 'Naslov',
    birthday: 'Rojstni dan',
    website: 'Spletna stran',
    note: 'Opomba',
  },
  en: {
    email: 'Email',
    phone: 'Phone',
    address: 'Address',
    birthday: 'Birthday',
    website: 'Website',
    note: 'Note',
  },
};

export function cardLabels(language: CardLanguage): Labels {
  return LABELS[language];
}

/** Atributi z dodajanjem pod prostim ključem (`Osnova`, `Osnova 2`, …), kot `VcardMapping.AttributeList`. */
export class AttributeList {
  private readonly items: Attribute[] = [];
  private readonly keys = new Set<string>();

  /** Atribut z neobveznim tipom (016); `parts` (samo naslov) nadomesti besedilno vrednost. */
  add(
    key: string | null,
    value: string | null,
    type?: AttributeType,
    parts?: Address | null,
  ): void {
    const empty = parts == null && (value == null || value.trim() === '');
    if (key == null || empty || this.keys.has(key.toLowerCase())) return;
    this.keys.add(key.toLowerCase());
    this.items.push({
      key,
      ...(type ? { type } : {}),
      ...(parts ? { parts } : { value }),
    } as Attribute);
  }

  addNumbered(base: string, from: number, value: string | null, type?: AttributeType): void {
    if (value == null || value.trim() === '') return;
    let n = from;
    while (this.keys.has(numbered(base, n).toLowerCase())) n++;
    this.add(numbered(base, n), value, type);
  }

  list(): Attribute[] {
    return [...this.items];
  }
}

function numbered(base: string, n: number): string {
  return n <= 1 ? base : `${base} ${n}`;
}

/** Ubežni znaki besedilne vrednosti vCard 3.0. */
export function escapeText(value: string): string {
  return value.replace(/\r/g, '').replace(/[\\,;\n]/g, (c) => (c === '\n' ? '\\n' : `\\${c}`));
}

/** Obratno od `escapeText`: `\n`/`\N` → prelom, `\x` → `x`. */
export function unescapeText(value: string): string {
  return value.replace(/\\(.)/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** Polno ime: zadnja beseda je priimek (FR-014-13). */
export function splitFullName(full: string | null): [string | null, string | null] {
  const text = (full ?? '').trim().replace(/\s+/g, ' ');
  if (text === '') return [null, null];
  const space = text.lastIndexOf(' ');
  if (space < 0) return [null, text];
  return [text.slice(0, space), text.slice(space + 1)];
}

/** Značka iz kategorije: presledki → `-`. */
export function categoryTag(category: string): string | null {
  const text = category.trim();
  return text === '' ? null : text.replace(/\s+/g, '-');
}

export function blankToNull(value: string | null | undefined): string | null {
  return value == null || value.trim() === '' ? null : value.trim();
}
