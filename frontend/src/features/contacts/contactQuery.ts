import type { TFunction } from 'i18next';

// Poizvedba seznama kontaktov v naslovu strani (specs/008-iskanje/data-model.md, research.md R-07, R-09).
// Ogrodje (T006): tipi in privzete vrednosti so pravi, funkcije še niso izvedene.

/** Polje pogoja ali razvrščanja: predefiniran atribut ali dodatni atribut s ključem. */
export type FieldRef =
  'firstName' | 'lastName' | 'address' | 'email' | 'phone' | { attribute: string };

export interface Condition {
  field: FieldRef;
  value: string;
}

export interface ContactQuery {
  q: string;
  conditions: Condition[];
  tags: string[];
  sort: FieldRef;
  dir: 'asc' | 'desc';
  /** 1-osna stran (v API je 0-osna). */
  page: number;
  size: number;
}

/** Uporabljen filter za prikaz (oznaka): pogoj ali značka. */
export type AppliedFilter =
  { kind: 'condition'; condition: Condition } | { kind: 'tag'; tag: string };

export function defaultQuery(): ContactQuery {
  return { q: '', conditions: [], tags: [], sort: 'lastName', dir: 'asc', page: 1, size: 25 };
}

const NOT_IMPLEMENTED = 'not implemented';

/** Poizvedba iz naslova (prizanesljivo: neveljavne vrednosti postanejo privzete). */
export function parseQuery(params: URLSearchParams): ContactQuery {
  void params;
  throw new Error(NOT_IMPLEMENTED);
}

/** Kanoničen zapis poizvedbe v naslovu (`?…` ali prazen niz); privzete vrednosti se ne zapišejo. */
export function serializeQuery(query: ContactQuery): string {
  void query;
  throw new Error(NOT_IMPLEMENTED);
}

/** Parametri zahtevka API (stran 0-osna). */
export function toApiParams(query: ContactQuery): URLSearchParams {
  void query;
  throw new Error(NOT_IMPLEMENTED);
}

/** Število uporabljenih filtrov: pogoji + značke (iskalni niz ne šteje). */
export function countFilters(query: ContactQuery): number {
  void query;
  throw new Error(NOT_IMPLEMENTED);
}

/** Opis filtra za oznako in dostopno ime (»kompetenca vsebuje web«, »Značka: vip«). */
export function describeFilter(filter: AppliedFilter, t: TFunction): string {
  void filter;
  void t;
  throw new Error(NOT_IMPLEMENTED);
}

/** Uveljavi spremembo; stran se ponastavi na 1, razen če je sprememba sama stran. */
export function withChange(query: ContactQuery, change: Partial<ContactQuery>): ContactQuery {
  void query;
  void change;
  throw new Error(NOT_IMPLEMENTED);
}
