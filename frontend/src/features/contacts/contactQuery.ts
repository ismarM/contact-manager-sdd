import type { TFunction } from 'i18next';

// Poizvedba seznama kontaktov v naslovu strani (specs/008-iskanje/data-model.md, research.md R-07, R-09).

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

const PREDEFINED = ['firstName', 'lastName', 'address', 'email', 'phone'] as const;
type PredefinedField = (typeof PREDEFINED)[number];

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_SIZE = 25;
export const MAX_CONDITIONS = 10;
export const MAX_TAGS = 30;

/** Predefinirana polja v vrstnem redu izbir (specs/008-iskanje/plan.md – Key elements). */
export const PREDEFINED_FIELDS: readonly PredefinedField[] = PREDEFINED;

function isPredefined(text: string): text is PredefinedField {
  return (PREDEFINED as readonly string[]).includes(text);
}

/** Ključ dodatnega atributa v naslovu: `%` → `%25`, `:` → `%3A` (R-07), da je prvo dvopičje vedno ločilo. */
function escapeKey(key: string): string {
  return key.replace(/%/g, '%25').replace(/:/g, '%3A');
}

function unescapeKey(key: string): string {
  return key.replace(/%(25|3A)/gi, (_, code: string) => (code === '25' ? '%' : ':'));
}

/** Polje v zapisu parametra: `email`, `x.kompetenca` (brez ubežanja ključa). */
export function fieldToParam(field: FieldRef): string {
  return typeof field === 'string' ? field : `x.${field.attribute}`;
}

/** Polje iz zapisa parametra (brez ubežanja ključa); neznano polje je `null`. */
export function fieldFromParam(text: string): FieldRef | null {
  if (isPredefined(text)) return text;
  if (text.startsWith('x.') && text.length > 2) return { attribute: text.slice(2) };
  return null;
}

/** Ali sta polji enaki (dodatni ključ ne glede na velikost črk, kot ga obravnava strežnik). */
export function isSameField(a: FieldRef, b: FieldRef): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.attribute.toLowerCase() === b.attribute.toLowerCase();
}

function conditionParam(condition: Condition): string {
  const field =
    typeof condition.field === 'string'
      ? condition.field
      : `x.${escapeKey(condition.field.attribute)}`;
  return `${field}:${condition.value}`;
}

function parseCondition(text: string): Condition | null {
  const colon = text.indexOf(':');
  if (colon < 1) return null;
  const name = text.slice(0, colon);
  const value = text.slice(colon + 1).trim();
  if (value === '') return null;
  const field = fieldFromParam(name.startsWith('x.') ? `x.${unescapeKey(name.slice(2))}` : name);
  return field === null ? null : { field, value };
}

/** Poizvedba iz naslova (prizanesljivo: neveljavne vrednosti postanejo privzete). */
export function parseQuery(params: URLSearchParams): ContactQuery {
  const defaults = defaultQuery();
  const conditions = params
    .getAll('f')
    .map(parseCondition)
    .filter((condition): condition is Condition => condition !== null)
    .slice(0, MAX_CONDITIONS);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of params.getAll('tag')) {
    const tag = raw.trim();
    const folded = tag.toLowerCase();
    if (tag === '' || seen.has(folded)) continue;
    seen.add(folded);
    tags.push(tag);
  }
  const page = Number(params.get('page'));
  const size = Number(params.get('size'));
  return {
    q: (params.get('q') ?? '').trim(),
    conditions,
    tags: tags.slice(0, MAX_TAGS),
    sort: fieldFromParam(params.get('sort') ?? '') ?? defaults.sort,
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
    page: Number.isInteger(page) && page >= 1 ? page : defaults.page,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : defaults.size,
  };
}

/** Kanoničen zapis poizvedbe v naslovu (`?…` ali prazen niz); privzete vrednosti se ne zapišejo. */
export function serializeQuery(query: ContactQuery): string {
  const params = new URLSearchParams();
  if (query.q.trim() !== '') params.set('q', query.q.trim());
  for (const condition of query.conditions) params.append('f', conditionParam(condition));
  for (const tag of query.tags) params.append('tag', tag);
  if (query.sort !== 'lastName') params.set('sort', fieldToParam(query.sort));
  if (query.dir === 'desc') params.set('dir', 'desc');
  if (query.size !== DEFAULT_SIZE) params.set('size', String(query.size));
  if (query.page > 1) params.set('page', String(query.page));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Parametri zahtevka API (stran 0-osna); privzeto razvrščanje strežnik določi sam. */
export function toApiParams(query: ContactQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q.trim() !== '') params.set('q', query.q.trim());
  for (const condition of query.conditions) params.append('f', conditionParam(condition));
  for (const tag of query.tags) params.append('tag', tag);
  if (query.sort !== 'lastName') params.set('sort', fieldToParam(query.sort));
  if (query.dir === 'desc') params.set('dir', 'desc');
  params.set('page', String(query.page - 1));
  params.set('size', String(query.size));
  return params;
}

/** Število uporabljenih filtrov: pogoji + značke (iskalni niz ne šteje). */
export function countFilters(query: ContactQuery): number {
  return query.conditions.length + query.tags.length;
}

/** Ime polja za prikaz (predefinirano polje prevedeno, dodatni ključ takšen, kot je). */
export function fieldLabel(field: FieldRef, t: TFunction): string {
  return typeof field === 'string' ? t(`contacts.filters.fields.${field}`) : field.attribute;
}

/** Opis filtra za oznako in dostopno ime (»kompetenca vsebuje web«, »Značka: vip«). */
export function describeFilter(filter: AppliedFilter, t: TFunction): string {
  if (filter.kind === 'tag') return t('contacts.filters.tagLabel', { tag: filter.tag });
  return t('contacts.filters.conditionLabel', {
    field: fieldLabel(filter.condition.field, t),
    value: filter.condition.value,
  });
}

/** Uveljavi spremembo; stran se ponastavi na 1, razen če je sprememba sama stran. */
export function withChange(query: ContactQuery, change: Partial<ContactQuery>): ContactQuery {
  return { ...query, ...change, page: change.page ?? 1 };
}
