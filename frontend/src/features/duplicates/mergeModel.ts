import type { CompareContact, MergeResultInput } from './types';

// Čisti model tabele razlik (research R-12): vrstice, privzete izbire, unija značk, izločitev, rezultat in odjemalska
// validacija. Ogrodje: brez izvedbe, funkcije vržejo napako.

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

/** Ogrodje: vedno vrže; argumenti so tu samo zato, da ogrodje ohrani končne podpise. */
function notImplemented(...call: unknown[]): never {
  throw new Error(`not implemented (${call.length})`);
}

export function buildRows(contacts: CompareContact[]): CompareRows {
  return notImplemented(contacts);
}

export function defaultChoices(contacts: CompareContact[]): MergeSelection {
  return notImplemented(contacts);
}

export function toggleTag(selection: MergeSelection, tag: string): MergeSelection {
  return notImplemented(selection, tag);
}

/** Izloči kontakt; izbire, ki so kazale na njegove vrednosti, se vrnejo na privzete. */
export function excludeContact(
  contacts: CompareContact[],
  selection: MergeSelection,
  contactId: string,
): { contacts: CompareContact[]; selection: MergeSelection } {
  return notImplemented(contacts, selection, contactId);
}

/** Izločanje je mogoče, dokler ostaneta vsaj dva kontakta. */
export function canExclude(contacts: CompareContact[]): boolean {
  return notImplemented(contacts);
}

/** Ohranjeni kontakt: prvi po vrstnem redu (najstarejši, po izločitvah prvi preostali). */
export function keptContact(contacts: CompareContact[]): CompareContact {
  return notImplemented(contacts);
}

export function buildResult(
  contacts: CompareContact[],
  selection: MergeSelection,
): MergeResultInput {
  return notImplemented(contacts, selection);
}

export function validateResult(result: MergeResultInput): ResultError[] {
  return notImplemented(result);
}
