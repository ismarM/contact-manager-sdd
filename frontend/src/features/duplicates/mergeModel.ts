import type { CompareContact, MergeResultInput } from './types';

// Čisti model tabele razlik (research R-12): vrstice, privzete izbire, unija značk, izločitev, rezultat in odjemalska
// validacija. Brez Reacta: ena resnica za vrstice, predogled in telo zahtevka.

export type FieldName = 'firstName' | 'lastName' | 'address' | 'email' | 'phone';

/** Ena možna vrednost vrstice: različna vrednost (`null` = »(prazno)«) in kontakti, ki jo imajo. */
export interface RowOption {
  value: string | null;
  contactIds: string[];
}

/** Vrstica polja ali dodatnega atributa. `key` je ime polja ali `attr:<ključ malimi črkami>`. */
export interface CompareRow {
  key: string;
  /** Ime polja ali ključ atributa (zapis iz prvega kontakta, ki ga ima). */
  label: string;
  kind: 'field' | 'attribute';
  options: RowOption[];
}

export interface CompareRows {
  /** Vrstice z vsaj dvema različnima vrednostma (izbirne). */
  rows: CompareRow[];
  /** Vrstice, v katerih imajo vsi kontakti enako vrednost (»Enaka polja (N)«). */
  identical: CompareRow[];
  /** Unija značk brez razlike velikosti črk, zapis prvega kontakta, ki jo ima. */
  tags: string[];
}

/** Izbire uporabnika: vrednost po vrstici (`null` = »(prazno)«) in obkljukane značke. */
export interface MergeSelection {
  values: Record<string, string | null>;
  tags: string[];
}

export interface ResultError {
  field: 'firstName' | 'lastName' | 'tags' | 'attributes';
  code: 'REQUIRED' | 'TOO_MANY';
  /** Koliko značk oziroma atributov je preveč (samo `TOO_MANY`). */
  excess?: number;
}

export const FIELDS: readonly FieldName[] = ['firstName', 'lastName', 'address', 'email', 'phone'];

/** Največ značk in dodatnih atributov kontakta (slovar podatkov, spec FR-011-13). */
export const MAX_TAGS = 30;
export const MAX_ATTRIBUTES = 50;

const attributeKey = (key: string) => `attr:${key.toLowerCase()}`;
const blankToNull = (value: string | null | undefined) =>
  value === null || value === undefined || value === '' ? null : value;

/** Vse vrstice (polja, nato atributi po prvem pojavu ključa) z različnimi vrednostmi po vrstnem redu kontaktov. */
function allRows(contacts: CompareContact[]): CompareRow[] {
  const rows: CompareRow[] = [];
  const build = (
    key: string,
    label: string,
    kind: CompareRow['kind'],
    read: (c: CompareContact) => string | null,
  ) => {
    const options: RowOption[] = [];
    for (const contact of contacts) {
      const value = read(contact);
      const existing = options.find((option) => option.value === value);
      if (existing) existing.contactIds.push(contact.id);
      else options.push({ value, contactIds: [contact.id] });
    }
    rows.push({ key, label, kind, options });
  };
  for (const field of FIELDS)
    build(field, field, 'field', (contact) => blankToNull(contact[field]));
  const seen = new Set<string>();
  for (const contact of contacts) {
    for (const attribute of contact.attributes) {
      const key = attributeKey(attribute.key);
      if (seen.has(key)) continue;
      seen.add(key);
      build(key, attribute.key, 'attribute', (other) =>
        blankToNull(
          other.attributes.find((candidate) => attributeKey(candidate.key) === key)?.value,
        ),
      );
    }
  }
  return rows;
}

function unionTags(contacts: CompareContact[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const contact of contacts) {
    for (const tag of contact.tags) {
      if (seen.has(tag.toLowerCase())) continue;
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags;
}

export function buildRows(contacts: CompareContact[]): CompareRows {
  const all = allRows(contacts);
  return {
    rows: all.filter((row) => row.options.length > 1),
    identical: all.filter((row) => row.options.length <= 1),
    tags: unionTags(contacts),
  };
}

const firstNonEmpty = (row: CompareRow): string | null =>
  row.options.find((option) => option.value !== null)?.value ?? null;

export function defaultChoices(contacts: CompareContact[]): MergeSelection {
  const values: Record<string, string | null> = {};
  for (const row of allRows(contacts)) values[row.key] = firstNonEmpty(row);
  return { values, tags: unionTags(contacts) };
}

export function toggleTag(selection: MergeSelection, tag: string): MergeSelection {
  const lower = tag.toLowerCase();
  const checked = selection.tags.some((existing) => existing.toLowerCase() === lower);
  return {
    ...selection,
    tags: checked
      ? selection.tags.filter((existing) => existing.toLowerCase() !== lower)
      : [...selection.tags, tag],
  };
}

/** Izloči kontakt; izbire, ki so kazale na njegove vrednosti, se vrnejo na privzete. */
export function excludeContact(
  contacts: CompareContact[],
  selection: MergeSelection,
  contactId: string,
): { contacts: CompareContact[]; selection: MergeSelection } {
  const remaining = contacts.filter((contact) => contact.id !== contactId);
  const values: Record<string, string | null> = {};
  for (const row of allRows(remaining)) {
    const chosen = selection.values[row.key];
    values[row.key] =
      chosen !== undefined && row.options.some((option) => option.value === chosen)
        ? chosen
        : firstNonEmpty(row);
  }
  const tags = unionTags(remaining).filter((tag) =>
    selection.tags.some((checked) => checked.toLowerCase() === tag.toLowerCase()),
  );
  return { contacts: remaining, selection: { values, tags } };
}

/** Izločanje je mogoče, dokler ostaneta vsaj dva kontakta. */
export function canExclude(contacts: CompareContact[]): boolean {
  return contacts.length > 2;
}

/** Ohranjeni kontakt: prvi po vrstnem redu (najstarejši, po izločitvah prvi preostali). */
export function keptContact(contacts: CompareContact[]): CompareContact {
  const first = contacts[0];
  if (!first) throw new Error('keptContact: brez kontaktov');
  return first;
}

export function buildResult(
  contacts: CompareContact[],
  selection: MergeSelection,
): MergeResultInput {
  const rows = allRows(contacts);
  const chosen = (row: CompareRow) =>
    row.key in selection.values ? (selection.values[row.key] ?? null) : firstNonEmpty(row);
  const field = (name: FieldName) => {
    const row = rows.find((candidate) => candidate.key === name);
    return row ? chosen(row) : null;
  };
  const attributes: { key: string; value: string }[] = [];
  for (const row of rows.filter((candidate) => candidate.kind === 'attribute')) {
    const value = chosen(row);
    if (value === null) continue;
    const owner = contacts
      .flatMap((contact) => contact.attributes)
      .find((attribute) => attributeKey(attribute.key) === row.key && attribute.value === value);
    attributes.push({ key: owner?.key ?? row.label, value });
  }
  return {
    firstName: field('firstName'),
    lastName: field('lastName'),
    address: field('address'),
    email: field('email'),
    phone: field('phone'),
    attributes,
    tags: unionTags(contacts).filter((tag) =>
      selection.tags.some((checked) => checked.toLowerCase() === tag.toLowerCase()),
    ),
  };
}

export function validateResult(result: MergeResultInput): ResultError[] {
  const errors: ResultError[] = [];
  const blank = (value: string | null) => value === null || value.trim() === '';
  if (blank(result.firstName) && blank(result.lastName)) {
    errors.push({ field: 'firstName', code: 'REQUIRED' });
  }
  if (result.tags.length > MAX_TAGS) {
    errors.push({ field: 'tags', code: 'TOO_MANY', excess: result.tags.length - MAX_TAGS });
  }
  if (result.attributes.length > MAX_ATTRIBUTES) {
    errors.push({
      field: 'attributes',
      code: 'TOO_MANY',
      excess: result.attributes.length - MAX_ATTRIBUTES,
    });
  }
  return errors;
}
