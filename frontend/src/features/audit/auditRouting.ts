import { AUDIT_ACTIONS, type AuditAction, type AuditFilters } from './types';

// Stanje seznama sledi v naslovu poti (plan.md 005 – Pages and routes): stran (1-osna), velikost, ponovljen action,
// contact. Privzete vrednosti se ne zapišejo, neveljavne se prezrejo.

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_SIZE = 25;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditView {
  page: number;
  size: number;
  filters: AuditFilters;
  /** `?contact=` ni veljaven uuid: prikaže se prazno stanje filtrov brez zahtevka. */
  contactInvalid: boolean;
}

export function readAuditView(params: URLSearchParams): AuditView {
  const page = Number(params.get('page'));
  const size = Number(params.get('size'));
  const actions = [...new Set(params.getAll('action'))].filter((a): a is AuditAction =>
    (AUDIT_ACTIONS as readonly string[]).includes(a),
  );
  const contact = params.get('contact');
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_SIZE,
    filters: { actions, contact: contact && UUID.test(contact) ? contact : null },
    contactInvalid: contact !== null && !UUID.test(contact),
  };
}

/** Poizvedba brez privzetih vrednosti. */
export function auditSearch(page: number, size: number, filters: AuditFilters): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (size !== DEFAULT_SIZE) params.set('size', String(size));
  for (const action of filters.actions) params.append('action', action);
  if (filters.contact) params.set('contact', filters.contact);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function hasFilters(filters: AuditFilters, contactInvalid: boolean): boolean {
  return filters.actions.length > 0 || filters.contact !== null || contactInvalid;
}
